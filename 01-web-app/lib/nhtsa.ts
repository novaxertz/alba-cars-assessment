/**
 * The upstream layer: two NHTSA APIs, normalised into one answer.
 *
 * Measured behaviour, not assumed (see BUILD_LOG.md):
 *  - vPIC answers in ~0.6s, recalls in ~0.3–0.9s. Neither is slow.
 *  - Two different hosts, two different envelopes: vPIC returns `Results`, recalls
 *    returns `results`. Same organisation, different capitalisation.
 *  - vPIC answers HTTP 200 even when it could not decode the VIN. The failure is inside
 *    the body as `ErrorCode`. Status-code-only handling would show a car that does not
 *    exist.
 *  - Recalls are keyed by make/model/year, NOT by VIN. See the caveat in the README:
 *    this reports open campaigns for a model, never that a given car is unrepaired.
 *  - NHTSA publishes no rate limit and I did not observe a 429. The backoff below is
 *    defensive, for when the upstream misbehaves — not a response to a limit I measured.
 */

const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles';
const RECALLS = 'https://api.nhtsa.gov/recalls';

export type DecodedVin = {
  vin: string;
  make: string;
  model: string;
  modelYear: string;
  bodyClass: string | null;
  fuelType: string | null;
  driveType: string | null;
  engine: string | null;
  doors: string | null;
  plant: string | null;
  manufacturer: string | null;
  /** '0' clean · '1' check digit does not calculate · anything else: could not decode */
  errorCode: string;
  errorText: string;
  decodedCleanly: boolean;
  checkDigitWarning: boolean;
};

export type Recall = {
  campaignNumber: string;
  component: string;
  summary: string;
  consequence: string;
  remedy: string;
  notes: string | null;
  reportReceivedDate: string | null;
  manufacturer: string | null;
  /** NHTSA's own severity flags. parkIt is "do not drive"; parkOutSide is a fire risk. */
  parkIt: boolean;
  parkOutSide: boolean;
  overTheAirUpdate: boolean;
  severity: 'critical' | 'serious' | 'standard';
};

export class UpstreamError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export class VinDecodeError extends Error {
  constructor(message: string, readonly errorCode: string, readonly errorText: string) {
    super(message);
    this.name = 'VinDecodeError';
  }
}

/**
 * Retry with exponential backoff and jitter.
 *
 * Retries on network failure, 5xx, 429 and 408 — the things that might succeed on a
 * second attempt. Does NOT retry 4xx generally: a malformed VIN will be just as
 * malformed in 300ms, and retrying it only adds load to a public service for no gain.
 * Honours Retry-After when the upstream sends one.
 */
async function fetchWithBackoff(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const backoff = 250 * 2 ** (attempt - 1);
      const jitter = Math.random() * 100; // spread retries so N clients don't sync up
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }

    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
        cache: 'no-store', // our own cache layer owns this decision
      });

      if (response.ok) return response;

      const retryable = response.status >= 500 || response.status === 429 || response.status === 408;
      if (!retryable) {
        throw new UpstreamError(`Upstream refused the request (${response.status})`, response.status);
      }

      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 10) {
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
      }

      lastError = new UpstreamError(`Upstream error ${response.status}`, response.status);
    } catch (error) {
      if (error instanceof UpstreamError && error.status && error.status < 500 && error.status !== 429) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? new UpstreamError(`NHTSA did not respond after ${attempts} attempts: ${lastError.message}`)
    : new UpstreamError(`NHTSA did not respond after ${attempts} attempts`);
}

const clean = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' || s.toLowerCase() === 'not applicable' ? null : s;
};

export async function decodeVin(vin: string): Promise<DecodedVin> {
  const response = await fetchWithBackoff(
    `${VPIC}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
  );
  const body = await response.json();
  const r = body?.Results?.[0];

  if (!r) throw new UpstreamError('vPIC returned no result for this VIN');

  const errorCode = String(r.ErrorCode ?? '');
  const errorText = String(r.ErrorText ?? '');
  const make = clean(r.Make);
  const modelYear = clean(r.ModelYear);

  // HTTP 200 with the failure inside the body. Without make and year there is nothing
  // to ask the recalls API about, so this is a dead end for the user either way.
  if (!make || !modelYear) {
    throw new VinDecodeError(
      'NHTSA could not decode this VIN far enough to look up recalls',
      errorCode,
      errorText,
    );
  }

  // vPIC returns displacement at absurd precision — 2.998832712 for a 3.0L engine.
  // Nobody describes a car that way, so round it to one decimal.
  const litres = clean(r.DisplacementL);
  const displacement = litres && Number.isFinite(Number(litres)) ? `${Number(litres).toFixed(1)}L` : null;

  const engineParts = [
    displacement,
    clean(r.EngineCylinders) && `${clean(r.EngineCylinders)} cyl`,
    clean(r.EngineHP) && `${Math.round(Number(clean(r.EngineHP)))} hp`,
  ].filter(Boolean);

  return {
    vin: vin.toUpperCase(),
    make,
    model: clean(r.Model) ?? '',
    modelYear,
    bodyClass: clean(r.BodyClass),
    fuelType: clean(r.FuelTypePrimary),
    driveType: clean(r.DriveType),
    engine: engineParts.length ? engineParts.join(' · ') : null,
    doors: clean(r.Doors),
    plant: [clean(r.PlantCity), clean(r.PlantCountry)].filter(Boolean).join(', ') || null,
    manufacturer: clean(r.Manufacturer),
    errorCode,
    errorText,
    decodedCleanly: errorCode === '0',
    checkDigitWarning: errorCode.split(',').includes('1'),
  };
}

function severityOf(r: { parkIt: boolean; parkOutSide: boolean }): Recall['severity'] {
  if (r.parkIt) return 'critical';       // NHTSA says do not drive it
  if (r.parkOutSide) return 'serious';   // fire risk; keep it away from buildings
  return 'standard';
}

export async function fetchRecalls(make: string, model: string, year: string): Promise<Recall[]> {
  // Matching is case-insensitive and tolerates multi-word models ("land rover" /
  // "range rover"), verified against the live API before relying on it.
  const url = `${RECALLS}/recallsByVehicle?make=${encodeURIComponent(make.toLowerCase())}&model=${encodeURIComponent(model.toLowerCase())}&modelYear=${encodeURIComponent(year)}`;

  const response = await fetchWithBackoff(url);
  const body = await response.json();

  // Note the lowercase `results` here against vPIC's `Results` above.
  const rows: unknown[] = body?.results ?? [];

  return rows
    .map((row) => {
      const r = row as Record<string, unknown>;
      const parkIt = r.parkIt === true || r.parkIt === 'true';
      const parkOutSide = r.parkOutSide === true || r.parkOutSide === 'true';
      return {
        campaignNumber: String(r.NHTSACampaignNumber ?? '—'),
        component: clean(r.Component) ?? 'Unspecified component',
        summary: clean(r.Summary) ?? '',
        consequence: clean(r.Consequence) ?? '',
        remedy: clean(r.Remedy) ?? '',
        notes: clean(r.Notes),
        reportReceivedDate: clean(r.ReportReceivedDate),
        manufacturer: clean(r.Manufacturer),
        parkIt,
        parkOutSide,
        overTheAirUpdate: r.overTheAirUpdate === true || r.overTheAirUpdate === 'true',
        severity: severityOf({ parkIt, parkOutSide }),
      } satisfies Recall;
    })
    .sort((a, b) => {
      const order = { critical: 0, serious: 1, standard: 2 };
      if (order[a.severity] !== order[b.severity]) return order[a.severity] - order[b.severity];
      return (b.reportReceivedDate ?? '').localeCompare(a.reportReceivedDate ?? '');
    });
}

/** 17 characters, no I/O/Q — those are excluded from the VIN alphabet to avoid confusion. */
export function normaliseVin(raw: string): { vin: string } | { error: string } {
  const vin = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  if (vin.length === 0) return { error: 'Enter a VIN.' };
  if (vin.length !== 17) return { error: `A VIN is 17 characters. That one is ${vin.length}.` };
  if (/[IOQ]/.test(vin)) return { error: 'VINs never contain I, O or Q. Check for a misread 1 or 0.' };
  if (!/^[A-HJ-NPR-Z0-9]+$/.test(vin)) return { error: 'That contains characters a VIN cannot have.' };
  return { vin };
}

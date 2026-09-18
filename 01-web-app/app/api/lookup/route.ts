import { NextResponse } from 'next/server';
import { cached } from '@/lib/cache';
import { decodeVin, fetchComplaints, fetchRecalls, normaliseVin, UpstreamError, VinDecodeError } from '@/lib/nhtsa';
import { analyse } from '@/lib/analysis';
import { summariesEnabled, summariseRecall } from '@/lib/summarise';

/**
 * The backend-for-frontend. Everything the browser gets comes through here.
 *
 * What this layer is actually for:
 *
 *  - **Two APIs, one answer.** vPIC decodes the VIN; the recalls API only accepts
 *    make/model/year, so the decode has to happen first. The browser should not have to
 *    know that, nor that one returns `Results` and the other `results`.
 *  - **Fan-out control.** A lot sweep is two upstream calls per vehicle. Caching and
 *    coalescing keep a page view from turning into twenty requests against a public
 *    .gov service.
 *  - **Per-resource TTLs.** A decoded VIN is immutable — the same VIN decodes the same
 *    way forever. Recall campaigns change monthly at most. Those are not the same
 *    number and pretending otherwise would be sloppy.
 *  - **Graceful degradation.** If NHTSA is down and we hold expired data, we answer with
 *    it and say how old it is. Clearly-labelled stale safety data beats a blank screen.
 *  - **Keys stay here.** If a model key is configured, it is used in this process and
 *    never serialised to the client.
 */

const DECODE_TTL = 30 * 24 * 60 * 60 * 1000; // effectively immutable
const RECALL_TTL = 6 * 60 * 60 * 1000;       // campaigns change monthly at most
const COMPLAINT_TTL = 12 * 60 * 60 * 1000;  // owners file these continuously, but slowly
const MAX_SWEEP = 12;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const raw = params.get('vin') ?? '';
  const withSummaries = params.get('summaries') !== 'off';

  const parsed = normaliseVin(raw);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error, kind: 'invalid_vin' }, { status: 400 });
  }
  const { vin } = parsed;

  try {
    const decode = await cached(`vin:${vin}`, DECODE_TTL, () => decodeVin(vin));
    const vehicle = decode.value;

    const recallsKey = `recalls:${vehicle.make}|${vehicle.model}|${vehicle.modelYear}`.toLowerCase();
    const recalls = await cached(recallsKey, RECALL_TTL, () =>
      fetchRecalls(vehicle.make, vehicle.model, vehicle.modelYear),
    );

    // Complaints are fetched in parallel with nothing else pending, and failure here is
    // survivable: the recall answer is still worth showing without the analysis.
    let analysis = null;
    let analysisFailed = false;
    try {
      const complaints = await cached(`complaints:${recallsKey}`, COMPLAINT_TTL, () =>
        fetchComplaints(vehicle.make, vehicle.model, vehicle.modelYear),
      );
      analysis = analyse(recalls.value, complaints.value);
    } catch {
      analysisFailed = true;
    }

    const summaries =
      withSummaries && summariesEnabled()
        ? await Promise.all(recalls.value.slice(0, 6).map((r) => summariseRecall(r)))
        : [];

    return NextResponse.json(
      {
        vehicle,
        recalls: recalls.value,
        analysis,
        analysisFailed,
        summaries,
        summariesFrom: summariesEnabled() ? 'model' : 'nhtsa',
        cache: {
          decodeAgeMs: decode.ageMs,
          recallsAgeMs: recalls.ageMs,
          // stale means: the upstream failed and this is last-known data
          stale: decode.stale || recalls.stale,
        },
      },
      {
        headers: {
          // The browser may reuse this briefly; our server cache is the real one.
          'cache-control': 'private, max-age=60',
        },
      },
    );
  } catch (error) {
    if (error instanceof VinDecodeError) {
      return NextResponse.json(
        { error: error.message, kind: 'undecodable_vin', errorCode: error.errorCode, errorText: error.errorText },
        { status: 422 },
      );
    }
    if (error instanceof UpstreamError) {
      return NextResponse.json(
        { error: error.message, kind: 'upstream_down' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Something failed on our side.', kind: 'unknown' }, { status: 500 });
  }
}

/** Sweep: several VINs at once, which is how a dealer actually uses this. */
export async function POST(request: Request) {
  let vins: string[] = [];
  try {
    const body = await request.json();
    vins = Array.isArray(body?.vins) ? body.vins.map(String) : [];
  } catch {
    return NextResponse.json({ error: 'Send { vins: string[] }.' }, { status: 400 });
  }

  if (vins.length === 0) return NextResponse.json({ error: 'No VINs supplied.' }, { status: 400 });
  if (vins.length > MAX_SWEEP) {
    return NextResponse.json(
      { error: `A sweep is capped at ${MAX_SWEEP} VINs, to stay polite to a public API.` },
      { status: 400 },
    );
  }

  const results = await Promise.all(
    vins.map(async (raw) => {
      const parsed = normaliseVin(raw);
      if ('error' in parsed) return { input: raw, ok: false as const, error: parsed.error };

      try {
        const decode = await cached(`vin:${parsed.vin}`, DECODE_TTL, () => decodeVin(parsed.vin));
        const v = decode.value;
        const recalls = await cached(
          `recalls:${v.make}|${v.model}|${v.modelYear}`.toLowerCase(),
          RECALL_TTL,
          () => fetchRecalls(v.make, v.model, v.modelYear),
        );

        return {
          input: raw,
          ok: true as const,
          vin: v.vin,
          label: `${v.modelYear} ${v.make} ${v.model}`.trim(),
          checkDigitWarning: v.checkDigitWarning,
          recallCount: recalls.value.length,
          worstSeverity: recalls.value[0]?.severity ?? null,
          stale: decode.stale || recalls.stale,
        };
      } catch (error) {
        return {
          input: raw,
          ok: false as const,
          error: error instanceof Error ? error.message : 'Lookup failed',
        };
      }
    }),
  );

  return NextResponse.json({ results });
}

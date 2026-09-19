'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Verdict } from './Verdict';
import { RecallCard } from './RecallCard';
import { LookupSkeleton } from './Skeletons';
import { SeverityIcon } from './icons';
import { DefectTimeline } from './DefectTimeline';
import { Findings } from './Findings';
import { ComplaintReader } from './ComplaintReader';
import type { Analysis } from '@/lib/analysis';
import { clearOrigin, playFrom } from '@/lib/flip';
import type { DecodedVin, Recall } from '@/lib/nhtsa';
import type { Summary } from '@/lib/summarise';

type Payload = {
  vehicle: DecodedVin;
  recalls: Recall[];
  analysis: Analysis | null;
  analysisFailed: boolean;
  complaintsCoverageGap: boolean;
  nothingOnFile: boolean;
  summaries: Summary[];
  summariesFrom: 'model' | 'nhtsa';
  cache: { decodeAgeMs: number; recallsAgeMs: number; stale: boolean };
};

type Failure = { error: string; kind: string; errorText?: string };

const EXAMPLES = [
  { vin: '1FTZR45E36PA12345', label: '2006 Ford Ranger', note: 'four "do not drive" recalls' },
  { vin: '1HGCM82633A004352', label: '2003 Honda Accord', note: '24 open campaigns' },
  { vin: 'ZZZZZZZZZZZZZZZZZ', label: 'Undecodable', note: 'how it fails' },
];

const age = (ms: number) => {
  if (ms < 1000) return 'just now';
  const m = Math.round(ms / 60000);
  if (m < 1) return `${Math.round(ms / 1000)}s ago`;
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
};

export function Lookup({ seed }: { seed?: { vin: string; label: string } | null } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const urlVin = params.get('vin') ?? '';
  // The filters live in the URL so any view of this page can be sent to somebody:
  //   /?vin=1FTZR45E36PA12345&component=SUSPENSION&harm=1
  // is "the suspension complaints on this Ranger that involved a crash, fire or injury".
  const urlComponent = params.get('component') ?? '';
  const urlHarm = params.get('harm') === '1';

  const [vin, setVin] = useState(seed?.vin ?? urlVin);
  const [data, setData] = useState<Payload | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  /** Rewrites the query string without adding history entries for every toggle. */
  const syncUrl = useCallback(
    (next: { vin: string; component?: string; harm?: boolean }) => {
      const q = new URLSearchParams();
      q.set('vin', next.vin);
      if (next.component) q.set('component', next.component);
      if (next.harm) q.set('harm', '1');
      startTransition(() => router.replace(`/?${q}`, { scroll: false }));
    },
    [router],
  );
  const [, startTransition] = useTransition();
  const lastRequested = useRef<string>('');
  const resultsPanel = useRef<HTMLDivElement | null>(null);
  const resultsInner = useRef<HTMLDivElement | null>(null);

  const run = useCallback(async (raw: string, { pushUrl = true } = {}) => {
    const candidate = raw.trim().toUpperCase();
    if (!candidate) return;

    lastRequested.current = candidate;
    setLoading(true);
    setFailure(null);
    setElapsed(null);

    const started = performance.now();
    try {
      const response = await fetch(`/api/lookup?vin=${encodeURIComponent(candidate)}`);
      const body = await response.json();

      // A slower earlier request must not overwrite a newer answer.
      if (lastRequested.current !== candidate) return;

      setElapsed(Math.round(performance.now() - started));
      if (!response.ok) {
        setFailure(body as Failure);
        setData(null);
      } else {
        setData(body as Payload);
      }

      if (pushUrl) {
        startTransition(() => router.replace(`/?vin=${encodeURIComponent(candidate)}`, { scroll: false }));
      }
    } catch {
      if (lastRequested.current !== candidate) return;
      clearOrigin();
      setFailure({ error: 'Could not reach the lookup service. Check your connection and try again.', kind: 'network' });
      setData(null);
    } finally {
      if (lastRequested.current === candidate) setLoading(false);
    }
  }, [router]);

  // A URL with ?vin= is a shareable link: it loads that result directly.
  useEffect(() => {
    const wanted = seed?.vin ?? urlVin;
    if (wanted && !data && !loading && !failure) {
      setVin(wanted);
      void run(wanted, { pushUrl: false });
    }
     
  }, [urlVin, seed?.vin]);

  const cacheBadge = data && (
    data.cache.stale ? (
      <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]"
            style={{ borderColor: 'var(--warning)', color: 'var(--warning)' }}>
        <SeverityIcon level="serious" />
        NHTSA unreachable — showing data from {age(data.cache.recallsAgeMs)}
      </span>
    ) : data.cache.recallsAgeMs > 1500 ? (
      <span className="rounded-full border border-hairline px-2.5 py-1 text-[12px] text-ink-muted">
        From cache · fetched {age(data.cache.recallsAgeMs)}{elapsed !== null && ` · ${elapsed}ms`}
      </span>
    ) : (
      <span className="rounded-full border border-hairline px-2.5 py-1 text-[12px] text-ink-muted">
        Fresh from NHTSA{elapsed !== null && ` · ${elapsed}ms`}
      </span>
    )
  );

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => { e.preventDefault(); void run(vin); }}
        className="panel p-4 sm:p-5"
      >
        <label htmlFor="vin" className="block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Vehicle identification number
        </label>

        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row">
          <input
            id="vin"
            name="vin"
            value={vin}
            onChange={(e) => setVin(e.target.value)}
            placeholder="1FTZR45E36PA12345"
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            aria-describedby="vin-help"
            className="vin-input min-w-0 flex-1 rounded-xl border border-[color:var(--rule)] bg-[color:var(--canvas)] px-4 py-3 text-[15px] outline-none transition-colors focus:border-[color:var(--accent)] sm:text-[17px]"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-white px-6 py-3 text-[15px] font-semibold text-black transition-all hover:bg-[#e9e9e4] active:scale-[0.985] disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Check this car'}
          </button>
        </div>

        <p id="vin-help" className="mt-2 text-[12px] text-ink-muted">
          17 characters. VINs never contain I, O or Q — it&rsquo;s on the windscreen edge, the door jamb, or the V5/registration.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <span className="text-[12px] text-ink-muted">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.vin}
              type="button"
              onClick={() => { setVin(ex.vin); void run(ex.vin); }}
              className="group rounded-full border border-hairline px-3 py-1 text-left text-[12px] transition-colors hover:border-[color:var(--rule)] hover:bg-[color:var(--surface-lift)]"
            >
              <span className="text-ink-secondary">{ex.label}</span>
              <span className="ml-1.5 text-ink-muted">{ex.note}</span>
            </button>
          ))}
        </div>
      </form>

      {/* Handed over from the lot sweep: the name is already known, so it renders in
          the same commit as the navigation. That is what the morph animates into, and
          it means the reader is never looking at an anonymous loading state. */}
      {loading && seed && !data && (
        <section className="panel p-4 sm:p-5">
          <h2 className="text-[17px] font-semibold tracking-tight">{seed.label}</h2>
          <p className="tnum mt-1 font-mono text-[12px] text-ink-muted">{seed.vin}</p>
        </section>
      )}

      {loading && <LookupSkeleton />}

      {!loading && failure && (
        <div className="panel lift overflow-hidden">
          <div className="h-1" style={{ background: failure.kind === 'upstream_down' ? 'var(--warning)' : 'var(--critical)' }} />
          <div className="p-5 sm:p-6">
            <h2 className="text-[17px] font-semibold">
              {failure.kind === 'invalid_vin' && 'That VIN does not look right'}
              {failure.kind === 'undecodable_vin' && 'NHTSA could not decode this VIN'}
              {failure.kind === 'upstream_down' && 'NHTSA is not responding'}
              {!['invalid_vin', 'undecodable_vin', 'upstream_down'].includes(failure.kind) && 'That did not work'}
            </h2>
            <p className="mt-1.5 text-[14px] text-ink-secondary">{failure.error}</p>

            {failure.errorText && (
              <div className="mt-3 rounded-xl bg-[color:var(--canvas)] p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">What NHTSA reported</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{failure.errorText}</p>
              </div>
            )}

            {failure.kind === 'undecodable_vin' && (
              <p className="mt-3 text-[13px] text-ink-muted">
                This is common for cars never sold in the United States. NHTSA only holds US-market
                vehicles, so a GCC-spec import may not decode at all.
              </p>
            )}
            {failure.kind === 'upstream_down' && (
              <p className="mt-3 text-[13px] text-ink-muted">
                Nothing cached for this vehicle yet, so there is no older answer to fall back on.
                Retried three times with backoff before giving up.
              </p>
            )}
          </div>
        </div>
      )}

      {!loading && data && (
        <div
          ref={(el) => {
            resultsPanel.current = el;
            // The outer box unfolds from the row's band; the inner wrapper runs the
            // inverse scale so the content inside is never squashed. Both are started
            // together so they cancel frame for frame - see lib/flip.ts.
            if (el) playFrom(data.vehicle.vin, el, resultsInner.current);
          }}
          style={{ transformOrigin: 'top center' }}
        >
          <div ref={resultsInner} style={{ transformOrigin: 'top center' }} className="space-y-4 cascade">
          <Verdict recalls={data.recalls} />

          <section className="panel lift p-4 sm:p-5" style={{ animationDelay: '60ms' }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              {/* Same ViewTransition name as the sweep row: the browser animates one
                  into the other instead of cutting between two unrelated screens. */}
              {/* The morph target. Attached to the real header as well as the seeded
                  one, because with a warm cache the lookup resolves between paints and
                  the seeded header never survives long enough to animate. playFrom
                  clears the recorded rect, so exactly one of the two plays. */}
              <h2 className="text-[17px] font-semibold tracking-tight">
                {data.vehicle.modelYear} {data.vehicle.make} {data.vehicle.model}
              </h2>
              {cacheBadge}
            </div>

            <dl className="mt-4 grid grid-cols-2 items-start gap-x-4 gap-y-3 sm:grid-cols-4">
              {([
                ['VIN', data.vehicle.vin],
                ['Body', data.vehicle.bodyClass],
                ['Engine', data.vehicle.engine],
                ['Drive', data.vehicle.driveType],
                ['Fuel', data.vehicle.fuelType],
                ['Doors', data.vehicle.doors],
                ['Built', data.vehicle.plant],
                ['Manufacturer', data.vehicle.manufacturer],
              ] as const)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  // The VIN is 17 characters of monospace and the only value that cannot
                  // wrap sensibly, so on phones it takes the whole row instead of half.
                  <div key={k} className={`min-w-0 ${k === 'VIN' ? 'col-span-2 sm:col-span-1' : ''}`}>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">{k}</dt>
                    {/* Wraps rather than truncates. These values are short facts, not prose:
                        clipping "4WD/4-Wheel Drive/4x4" or "FORD MOTOR COMPANY" to fit a
                        quarter column hides the answer to the question the row is asking. */}
                    <dd className={`mt-0.5 text-[14px] break-words ${k === 'VIN' ? 'tnum font-mono text-[13px]' : ''}`} title={v ?? ''}>
                      {v}
                    </dd>
                  </div>
                ))}
            </dl>

            {data.vehicle.checkDigitWarning && (
              <p className="mt-4 flex items-start gap-2 border-t border-hairline pt-3 text-[13px]" style={{ color: 'var(--warning)' }}>
                <span className="mt-0.5 shrink-0"><SeverityIcon level="serious" /></span>
                <span>
                  The check digit on this VIN doesn&rsquo;t calculate. NHTSA still decoded it, but the
                  number may have been mistyped — worth confirming against the plate.
                </span>
              </p>
            )}
          </section>

          {data.analysis && data.analysis.totalComplaints > 0 && (
            <section className="panel lift p-4 sm:p-5" style={{ animationDelay: '90ms' }} aria-label="Complaint history">
              <h2 className="text-[15px] font-semibold">Fault history</h2>
              <p className="mt-1 mb-4 text-[13px] text-ink-secondary">
                Complaints owners filed each year, with the years recall campaigns opened marked
                beneath. Shown side by side deliberately — a spike often follows a recall being
                announced, because publicity drives reporting, so the shape is evidence rather
                than proof of cause.
              </p>
              <DefectTimeline analysis={data.analysis} />
            </section>
          )}

          {data.analysis && (
            <Findings
              analysis={data.analysis}
              onSelect={(component) => syncUrl({ vin: data.vehicle.vin, component, harm: urlHarm })}
            />
          )}

          {urlComponent && (
            <ComplaintReader
              vin={data.vehicle.vin}
              component={urlComponent}
              harmOnly={urlHarm}
              onHarmChange={(harm) => syncUrl({ vin: data.vehicle.vin, component: urlComponent, harm })}
              onClose={() => syncUrl({ vin: data.vehicle.vin })}
            />
          )}

          {data.complaintsCoverageGap && (
            <section className="panel lift p-4 sm:p-5" style={{ animationDelay: '90ms' }}>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--warning)' }}>
                <SeverityIcon level="serious" />
                Fault history unavailable — not clean
              </h2>
              <p className="mt-1.5 text-[13px] text-ink-secondary">
                NHTSA returned {data.recalls.length} recall {data.recalls.length === 1 ? 'campaign' : 'campaigns'} for
                this vehicle but <strong className="font-medium text-ink">no complaints at all</strong>, which is
                not the same as none existing. Their complaints endpoint has coverage gaps by model
                year — a 2015 F-150 returns zero while the 2016 returns 63.
              </p>
              <p className="mt-2 text-[13px] text-ink-muted">
                Treat the owner-complaint side of this report as missing rather than empty.
              </p>
            </section>
          )}

          {data.nothingOnFile && (
            <section className="panel lift p-4 sm:p-5" style={{ animationDelay: '90ms' }}>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--warning)' }}>
                <SeverityIcon level="serious" />
                NHTSA holds nothing for this vehicle
              </h2>
              <p className="mt-1.5 text-[13px] text-ink-secondary">
                No recall campaigns and no complaints came back. That can mean a genuinely clean
                record, or that NHTSA files this model under a different name than the VIN decoder
                returns. Confirm before treating it as clear.
              </p>
            </section>
          )}

          {data.analysisFailed && (
            <p className="panel lift p-4 text-[13px] text-ink-secondary">
              The complaints database did not respond, so the fault history is missing. The recall
              information below is unaffected.
            </p>
          )}

          {data.recalls.length > 0 && (
            <section className="space-y-3" aria-label="Open recall campaigns">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                  {data.recalls.length} {data.recalls.length === 1 ? 'campaign' : 'campaigns'}, most serious first
                </h2>
                {data.summariesFrom === 'nhtsa' && (
                  <span className="text-[12px] text-ink-muted">Plain-language summaries off</span>
                )}
              </div>

              {data.recalls.map((recall, i) => (
                <RecallCard key={recall.campaignNumber + i} recall={recall} summary={data.summaries[i]} index={i} />
              ))}
            </section>
          )}
          </div>
        </div>
      )}

      {!loading && !data && !failure && (
        <div className="panel lift px-6 py-14 text-center">
          <div aria-hidden className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full border border-dashed border-[color:var(--rule)] text-ink-muted">
            <SeverityIcon level="clear" className="size-5" />
          </div>
          <p className="text-[15px] font-medium">Check a car before you commit to it</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[13px] text-ink-secondary">
            Recalls are what the manufacturer admitted. Complaints are what owners lived with.
            Paste a VIN above, or try one of the examples.
          </p>
        </div>
      )}
    </div>
  );
}

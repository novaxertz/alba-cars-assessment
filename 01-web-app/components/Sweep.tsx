'use client';

import { useRef, useState } from 'react';
import { SeverityIcon } from './icons';
import { playExit, recordOrigin } from '@/lib/flip';

type Row =
  | { input: string; ok: true; vin: string; label: string; recallCount: number; worstSeverity: 'critical' | 'serious' | 'standard' | null; checkDigitWarning: boolean; stale: boolean }
  | { input: string; ok: false; error: string };

const COLOR = { critical: 'var(--critical)', serious: 'var(--serious)', standard: 'var(--warning)' } as const;

/**
 * Sweep the lot: several VINs at once, which is how this is actually used.
 *
 * Each VIN resolves independently, so one bad row never fails the batch — the response
 * is a list of per-item outcomes rather than all-or-nothing. That is deliberate: a
 * dealer pasting twenty VINs from a spreadsheet will have a typo in one of them, and
 * losing the other nineteen to it would be useless.
 */
export function Sweep({ onOpenDetail }: { onOpenDetail: (vin: string, label: string) => void }) {
  // One ref per rendered row, so the clicked row's rect can be measured before the DOM
  // changes underneath it.
  // One ref per row so the clicked row's rect can be measured before the DOM changes,
  // plus the panel itself so the list can be faded out under the incoming detail.
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const panelRef = useRef<HTMLElement | null>(null);
  const [raw, setRaw] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vins = raw.split(/[\s,;]+/).map((v) => v.trim()).filter(Boolean);

  async function run() {
    if (vins.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vins }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? 'The sweep failed.'); setRows(null); }
      else setRows(body.results as Row[]);
    } catch {
      setError('Could not reach the lookup service.');
    } finally {
      setLoading(false);
    }
  }

  const flagged = rows?.filter((r) => r.ok && r.recallCount > 0).length ?? 0;
  const critical = rows?.filter((r) => r.ok && r.worstSeverity === 'critical').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-5">
        <label htmlFor="vins" className="block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          One VIN per line
        </label>
        <p className="mt-1.5 text-[12px] text-ink-muted">
          Paste the VIN column straight out of your stock list. Capped at 12 per sweep — two
          upstream calls each, against a public API.
        </p>

        <textarea
          id="vins"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={'1FTZR45E36PA12345\n1HGCM82633A004352\nWBA8E9G59GNT10093'}
          className="vin-input mt-3 w-full resize-y rounded-xl border border-[color:var(--rule)] bg-[color:var(--canvas)] px-4 py-3 text-[14px] leading-relaxed outline-none transition-colors focus:border-[color:var(--accent)]"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={run}
            disabled={loading || vins.length === 0}
            className="rounded-xl bg-white px-5 py-2.5 text-[15px] font-semibold text-black transition-all hover:bg-[#e9e9e4] active:scale-[0.985] disabled:opacity-40"
          >
            {loading ? `Checking ${vins.length}…` : `Check ${vins.length || ''} ${vins.length === 1 ? 'VIN' : 'VINs'}`.trim()}
          </button>
          {vins.length > 12 && (
            <span className="text-[12px]" style={{ color: 'var(--warning)' }}>
              {vins.length} pasted — only the first 12 will be accepted.
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="space-y-3" aria-live="polite" aria-busy="true">
          <div className="h-1 rounded-full sweep-rail" />
          <div className="panel divide-y divide-[color:var(--hairline)]">
            {Array.from({ length: Math.min(vins.length, 5) }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <div className="skeleton size-4 shrink-0 rounded-full" />
                <div className="skeleton h-4 flex-1" />
                <div className="skeleton h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="panel lift p-5" style={{ borderColor: 'var(--critical)' }}>
          <p className="text-[14px]" style={{ color: 'var(--critical)' }}>{error}</p>
        </div>
      )}

      {!loading && rows && (
        <section ref={panelRef} className="panel lift overflow-hidden" aria-label="Sweep results">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline p-4">
            <h2 className="text-[15px] font-semibold">
              {flagged} of {rows.length} {flagged === 1 ? 'car has' : 'cars have'} open campaigns
            </h2>
            {critical > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--critical)' }}>
                <SeverityIcon level="critical" />
                {critical} should not be driven
              </span>
            )}
          </div>

          <ul className="divide-y divide-[color:var(--hairline)]">
            {rows.map((row, i) => (
              <li
                key={row.input + i}
                ref={(el) => { if (row.ok) rowRefs.current[row.vin] = el; }}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4"
              >
                {row.ok ? (
                  <>
                    <span
                      className="shrink-0"
                      style={{ color: row.worstSeverity ? COLOR[row.worstSeverity] : 'var(--good)' }}
                    >
                      <SeverityIcon level={row.worstSeverity ?? 'clear'} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">{row.label}</p>
                      <p className="tnum font-mono text-[12px] text-ink-muted">{row.vin}</p>
                    </div>
                    {row.checkDigitWarning && (
                      <span className="text-[12px]" style={{ color: 'var(--warning)' }}>check digit</span>
                    )}
                    <span className="tnum text-[13px] text-ink-secondary">
                      {row.recallCount === 0 ? 'clear' : `${row.recallCount} open`}
                    </span>
                    <button
                      onClick={() => {
                        // Measure the row, then get the list out of the way. The detail
                        // panel animates in from exactly this rect - see lib/flip.ts.
                        recordOrigin(row.vin, rowRefs.current[row.vin]);
                        playExit(panelRef.current);
                        onOpenDetail(row.vin, row.label);
                      }}
                      className="text-[13px] text-ink-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-ink"
                    >
                      Detail
                    </button>
                  </>
                ) : (
                  <>
                    <span className="shrink-0 text-ink-muted"><SeverityIcon level="standard" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="tnum font-mono text-[13px] text-ink-secondary">{row.input || '(blank)'}</p>
                      <p className="text-[12px] text-ink-muted">{row.error}</p>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

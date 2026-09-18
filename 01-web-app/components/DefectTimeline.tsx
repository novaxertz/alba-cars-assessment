'use client';

import type { Analysis } from '@/lib/analysis';

/**
 * Complaints per year, with recall campaigns marked underneath.
 *
 * Hand-built SVG rather than a chart library: this is one chart, the shape is simple,
 * and pulling in Recharts for it would roughly double the client bundle of an app whose
 * whole argument is that the work happens on the server.
 *
 * The chart deliberately makes no causal claim — it puts the complaint volume and the
 * campaign years side by side and lets the reader see the relationship. Two encodings:
 * total complaints, and the subset that involved a crash, fire, injury or death. The
 * harm subset is drawn over the same bar rather than beside it, because it is a portion
 * of that year's complaints, not a separate population.
 *
 * Bars animate by scaling on the Y axis from the baseline — a composited transform, so
 * it stays off the main thread.
 */
export function DefectTimeline({ analysis }: { analysis: Analysis }) {
  const { timeline, campaignMarkers } = analysis;
  if (timeline.length < 2) return null;

  const W = 720;
  const H = 168;
  const PAD_L = 30;
  const PAD_B = 34;
  // Headroom for the direct label above the tallest bar — without it the peak figure
  // renders outside the viewBox and gets clipped.
  const PAD_T = 22;
  const max = Math.max(...timeline.map((t) => t.complaints), 1);
  const slot = (W - PAD_L - 8) / timeline.length;
  const barW = Math.max(3, Math.min(26, slot - 4));

  const campaignsByYear = new Map(campaignMarkers.map((m) => [m.year, m.count]));

  // Label every year when there is room, otherwise every other one.
  const labelEvery = slot < 26 ? 2 : 1;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">
        Owner complaints per year with recall campaign years marked
      </figcaption>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-3 rounded-[2px]" style={{ background: 'var(--accent)' }} />
          Complaints filed
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-3 rounded-[2px]" style={{ background: 'var(--critical)' }} />
          Involved a crash, fire or injury
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-0" style={{ borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '6px solid var(--warning)' }} />
          Recall campaign opened
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Complaints per year from ${analysis.windowFrom} to ${analysis.windowTo}, peaking at ${max}`}>
        {/* gridlines */}
        {[0, 0.5, 1].map((f) => {
          const y = (H - PAD_B) - f * (H - PAD_B - PAD_T);
          return (
            <g key={f}>
              <line x1={PAD_L} x2={W - 4} y1={y} y2={y} stroke="var(--hairline)" strokeWidth="1" />
              <text x={0} y={y + 4} fill="var(--ink-muted)" fontSize="10">{Math.round(f * max)}</text>
            </g>
          );
        })}

        {timeline.map((t, i) => {
          const x = PAD_L + i * slot + (slot - barW) / 2;
          const full = (t.complaints / max) * (H - PAD_B - PAD_T);
          const harm = (t.harm / max) * (H - PAD_B - PAD_T);
          const base = H - PAD_B;

          return (
            <g key={t.year}>
              {t.complaints > 0 && (
                <>
                  <rect
                    x={x} y={base - full} width={barW} height={full} rx="3"
                    fill="var(--accent)"
                    style={{
                      transformOrigin: `${x + barW / 2}px ${base}px`,
                      animation: `grow 520ms cubic-bezier(0.2,0.7,0.2,1) ${Math.min(i * 28, 420)}ms both`,
                    }}
                  />
                  {t.harm > 0 && (
                    <rect
                      x={x} y={base - harm} width={barW} height={harm} rx="3"
                      fill="var(--critical)"
                      style={{
                        transformOrigin: `${x + barW / 2}px ${base}px`,
                        animation: `grow 520ms cubic-bezier(0.2,0.7,0.2,1) ${Math.min(i * 28, 420) + 90}ms both`,
                      }}
                    />
                  )}
                </>
              )}

              {/* peak year gets its number, so the chart has one direct label rather than none */}
              {t.complaints === max && (
                <text x={x + barW / 2} y={base - full - 5} fill="var(--ink-secondary)" fontSize="11" textAnchor="middle">
                  {t.complaints}
                </text>
              )}

              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={base + 13} fill="var(--ink-muted)" fontSize="10" textAnchor="middle">
                  {String(t.year).slice(2)}
                </text>
              )}

              {campaignsByYear.has(t.year) && (
                <g>
                  <polygon
                    points={`${x + barW / 2 - 4},${base + 26} ${x + barW / 2 + 4},${base + 26} ${x + barW / 2},${base + 19}`}
                    fill="var(--warning)"
                  />
                  <title>{campaignsByYear.get(t.year)} recall campaign(s) opened in {t.year}</title>
                </g>
              )}
            </g>
          );
        })}

        <line x1={PAD_L} x2={W - 4} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--rule)" strokeWidth="1" />
      </svg>

      {/* The same data as text, for anyone who cannot use the chart. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-[12px] text-ink-muted hover:text-ink-secondary">
          Show these figures as a table
        </summary>
        <table className="mt-2 w-full text-[12px]">
          <thead>
            <tr className="text-left text-ink-muted">
              <th scope="col" className="py-1 font-medium">Year</th>
              <th scope="col" className="py-1 font-medium">Complaints</th>
              <th scope="col" className="py-1 font-medium">Involving harm</th>
              <th scope="col" className="py-1 font-medium">Campaigns opened</th>
            </tr>
          </thead>
          <tbody className="text-ink-secondary">
            {timeline.map((t) => (
              <tr key={t.year} className="border-t border-hairline">
                <td className="tnum py-1">{t.year}</td>
                <td className="tnum py-1">{t.complaints}</td>
                <td className="tnum py-1">{t.harm}</td>
                <td className="tnum py-1">{campaignsByYear.get(t.year) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

import Link from 'next/link';
import { aed } from '@/lib/format';
import type { RecommendationWithVehicle } from '@/lib/types';

const TONE = {
  urgent: 'var(--critical)',
  act: 'var(--serious)',
  watch: 'var(--warning)',
} as const;

/**
 * What the nightly agent last recommended.
 *
 * This is the other half of ../03-n8n-workflow showing up in the product. The agent
 * reads this dashboard's ageing view, scores a markdown, and writes back here — and
 * nothing is applied automatically. A recommendation sits until a human acts on it,
 * which is the right default for a machine proposing price cuts.
 */
export function Recommendations({ rows }: { rows: RecommendationWithVehicle[] }) {
  if (rows.length === 0) {
    return (
      <section className="card rise p-5">
        <h2 className="text-[15px] font-semibold">Nightly review</h2>
        <p className="mt-1 text-[13px] text-ink-secondary">
          The markdown agent has not run yet. When it does, its recommendations appear here.
        </p>
      </section>
    );
  }

  const latest = rows[0].run_date;

  return (
    <section className="card rise overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-5 py-3">
        <h2 className="text-[15px] font-semibold">Nightly review</h2>
        <p className="text-[12px] text-ink-muted">
          Proposed by the markdown agent on {latest} · nothing applied automatically
        </p>
      </div>

      <ul className="divide-y divide-hairline">
        {rows.map((r) => {
          const cut = r.current_price_aed - r.recommended_price_aed;
          return (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: TONE[r.severity] }}
              />
              <Link
                href={`/vehicles/${r.vehicle_id}`}
                className="text-[14px] font-medium hover:text-[color:var(--accent-ink)]"
              >
                {r.vehicles ? `${r.vehicles.make} ${r.vehicles.model}` : 'Vehicle'}
              </Link>
              <span className="tnum text-[12px] text-ink-muted">{r.days_on_lot}d</span>

              <span className="tnum ml-auto text-[13px] text-ink-secondary">
                {aed(r.current_price_aed)} → <span className="font-medium text-ink">{aed(r.recommended_price_aed)}</span>
              </span>
              <span className="tnum text-[13px]" style={{ color: TONE[r.severity] }}>
                −{aed(cut)}
              </span>

              <p className="w-full text-[12px] leading-relaxed text-ink-muted">{r.rationale}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

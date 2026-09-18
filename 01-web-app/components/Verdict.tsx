import { SeverityIcon } from './icons';
import type { Recall } from '@/lib/nhtsa';

const TONE = {
  critical: { color: 'var(--critical)', label: 'Do not drive' },
  serious: { color: 'var(--serious)', label: 'Park outside' },
  standard: { color: 'var(--warning)', label: 'Open recall' },
  clear: { color: 'var(--good)', label: 'No open campaigns' },
} as const;

/**
 * The headline. One car, one answer, before any detail.
 *
 * The wording is careful on purpose: "open campaigns for this model", never "this car
 * needs repair". NHTSA answers by make/model/year, so we cannot know whether this
 * particular vehicle was already fixed — and a tool that overstates what it knows about
 * a safety recall is worse than no tool.
 */
export function Verdict({ recalls }: { recalls: Recall[] }) {
  const parkIt = recalls.filter((r) => r.parkIt).length;
  const parkOutside = recalls.filter((r) => r.parkOutSide).length;

  const level: keyof typeof TONE =
    recalls.length === 0 ? 'clear' : parkIt > 0 ? 'critical' : parkOutside > 0 ? 'serious' : 'standard';
  const tone = TONE[level];

  const headline =
    recalls.length === 0
      ? 'No open recall campaigns'
      : parkIt > 0
        ? `${parkIt} "do not drive" ${parkIt === 1 ? 'recall' : 'recalls'}`
        : `${recalls.length} open recall ${recalls.length === 1 ? 'campaign' : 'campaigns'}`;

  const detail =
    recalls.length === 0
      ? 'NHTSA lists nothing outstanding for this model year.'
      : parkIt > 0
        ? 'NHTSA advises these vehicles should not be driven until the repair is done.'
        : parkOutside > 0
          ? `${parkOutside} of these carry a fire risk — NHTSA advises parking away from buildings.`
          : 'Worth resolving before the car goes on the forecourt.';

  return (
    <div className="panel lift overflow-hidden">
      <div className="h-1" style={{ background: tone.color }} />
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <span
          className={`mt-0.5 shrink-0 ${level === 'critical' ? 'alarm' : ''}`}
          style={{ color: tone.color }}
        >
          <SeverityIcon level={level} className="size-7" />
        </span>

        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: tone.color }}>
            {tone.label}
          </p>
          <h2 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight sm:text-[26px]">
            {headline}
          </h2>
          <p className="mt-1.5 text-[13px] text-ink-secondary">{detail}</p>

          <p className="mt-3 border-t border-hairline pt-3 text-[12px] text-ink-muted">
            These are campaigns open for this <strong className="font-medium text-ink-secondary">make, model and year</strong> —
            NHTSA does not expose per-VIN repair status. Confirm with the manufacturer whether
            this specific car has already been fixed.
          </p>
        </div>
      </div>
    </div>
  );
}

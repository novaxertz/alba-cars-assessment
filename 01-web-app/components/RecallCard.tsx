'use client';

import { useState } from 'react';
import { SeverityIcon } from './icons';
import type { Recall } from '@/lib/nhtsa';
import type { Summary } from '@/lib/summarise';

const COLOR = {
  critical: 'var(--critical)',
  serious: 'var(--serious)',
  standard: 'var(--warning)',
} as const;

const LABEL = {
  critical: 'Do not drive',
  serious: 'Fire risk — park outside',
  standard: 'Open recall',
} as const;

export function RecallCard({ recall, summary, index }: { recall: Recall; summary?: Summary; index: number }) {
  const [open, setOpen] = useState(false);
  const color = COLOR[recall.severity];

  return (
    <article
      className="panel lift overflow-hidden"
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
    >
      <div className="flex">
        {/* severity rail — redundant with the icon and label, never the only cue */}
        <div className="w-1 shrink-0" style={{ background: color }} aria-hidden />

        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em]" style={{ color }}>
              <SeverityIcon level={recall.severity} />
              {LABEL[recall.severity]}
            </span>
            <span className="tnum text-[12px] text-ink-muted">{recall.campaignNumber}</span>
            {recall.reportReceivedDate && (
              <span className="tnum text-[12px] text-ink-muted">· {recall.reportReceivedDate}</span>
            )}
            {recall.overTheAirUpdate && (
              <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink-secondary">
                Fixable over the air
              </span>
            )}
          </div>

          <h3 className="mt-2 text-[15px] leading-snug font-semibold">{recall.component}</h3>

          {summary && (
            <p className="mt-2 text-[14px] leading-relaxed text-ink-secondary">
              {summary.text}
              {summary.source === 'nhtsa' && (
                <span className="ml-1.5 text-[12px] text-ink-muted">— NHTSA&rsquo;s wording</span>
              )}
            </p>
          )}

          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-3 text-[13px] text-ink-muted underline decoration-dotted underline-offset-4 transition-colors hover:text-ink"
          >
            {open ? 'Hide the full notice' : 'Read the full notice'}
          </button>

          {open && (
            <dl className="lift mt-3 space-y-3 border-t border-hairline pt-3 text-[13px] leading-relaxed">
              {([
                ['What NHTSA says', recall.summary],
                ['Consequence', recall.consequence],
                ['Remedy', recall.remedy],
                ['Notes', recall.notes],
              ] as const)
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">{k}</dt>
                    <dd className="mt-1 text-ink-secondary">{v}</dd>
                  </div>
                ))}
              {recall.manufacturer && (
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-ink-muted">Manufacturer</dt>
                  <dd className="mt-1 text-ink-secondary">{recall.manufacturer}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>
    </article>
  );
}

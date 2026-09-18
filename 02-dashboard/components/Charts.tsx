'use client';

import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { aed, aedCompact, bucketColor, bucketLabel, SERIES, type Bucket } from '@/lib/format';
import type { SummaryRow } from '@/lib/types';

const AXIS = { stroke: '#c3c2b7', fontSize: 12, fill: '#898781' };

function TooltipCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="card px-3 py-2 shadow-sm" style={{ boxShadow: '0 4px 16px rgba(11,11,11,0.08)' }}>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <dl className="mt-1 space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6 text-[12px]">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="tnum text-ink-secondary">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Capital tied up by ageing bucket.
 *
 * Buckets are ordered, so the colour is an ordinal ramp of one hue rather than four
 * unrelated hues: darker means older, which is magnitude, not identity. One series, so
 * no legend — the title names it.
 */
export function AgeingChart({ data }: { data: SummaryRow[] }) {
  const rows = data.map((d) => ({ ...d, capital_aed: Number(d.capital_aed) }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid vertical={false} stroke="#e1e0d9" strokeWidth={1} />
        <XAxis dataKey="ageing_bucket" tickLine={false} axisLine={{ stroke: '#c3c2b7' }} tick={AXIS} />
        <YAxis tickFormatter={(v) => aedCompact(v).replace(' AED', '')} tickLine={false} axisLine={false} tick={AXIS} width={52} />
        <Tooltip
          cursor={{ fill: 'rgba(11,11,11,0.035)' }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipCard
                title={bucketLabel[payload[0].payload.ageing_bucket as Bucket]}
                rows={[
                  ['Vehicles', String(payload[0].payload.vehicle_count)],
                  ['Capital tied up', aed(payload[0].payload.capital_aed)],
                  ['Holding cost so far', aed(Number(payload[0].payload.holding_cost_aed))],
                  ['Marked down', aed(Number(payload[0].payload.markdown_aed))],
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="capital_aed" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive>
          {rows.map((r) => (
            <Cell key={r.ageing_bucket} fill={bucketColor[r.ageing_bucket]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

type Series = { id: string; label: string; cost: number; points: { day: number; price: number }[] };

/**
 * Price decay, indexed to each car's first listing (100 = the price it went on the lot at).
 *
 * The first version plotted absolute AED and was unreadable: a 219,000 AED Porsche and a
 * 47,500 AED Lexus on one axis squash every line flat, and the decay — the entire point —
 * disappears. Indexing to a common base is the standard fix for series of different
 * magnitude, and it turns the chart into the question a manager actually asks: which car
 * has given up the largest share of its asking price, and how fast?
 *
 * Legend plus a shared-axis table below carry identity, since three of the categorical
 * slots sit under 3:1 against this surface.
 */
export function DecayChart({ series }: { series: Series[] }) {
  const indexed = series.map((s) => {
    const base = s.points[0]?.price || 1;
    return {
      ...s,
      base,
      points: s.points.map((p) => ({ ...p, pct: (p.price / base) * 100, price: p.price })),
    };
  });

  const maxDay = Math.max(...indexed.flatMap((s) => s.points.map((p) => p.day)), 1);
  const minPct = Math.min(...indexed.flatMap((s) => s.points.map((p) => p.pct)), 100);

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {indexed.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
            <span
              aria-hidden
              className="inline-block h-0.5 w-4 rounded-full"
              style={{ background: SERIES[i % SERIES.length] }}
            />
            {s.label}
          </li>
        ))}
      </ul>

      <ResponsiveContainer width="100%" height={212}>
        <LineChart margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid vertical={false} stroke="#e1e0d9" />
          <XAxis
            type="number" dataKey="day" domain={[0, maxDay]}
            tickLine={false} axisLine={{ stroke: '#c3c2b7' }} tick={AXIS}
            label={{ value: 'days on lot', position: 'insideBottomRight', offset: -2, fill: '#898781', fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="pct" domain={[Math.floor(minPct - 3), 101]}
            tickFormatter={(v) => `${v}%`}
            tickLine={false} axisLine={false} tick={AXIS} width={44}
          />
          <ReferenceLine y={100} stroke="#c3c2b7" strokeDasharray="3 3" />
          <Tooltip
            cursor={{ stroke: '#c3c2b7', strokeDasharray: '3 3' }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipCard
                  title={String(payload[0].name ?? '')}
                  rows={[
                    ['Day on lot', String(payload[0].payload.day)],
                    ['Asking price', aed(payload[0].payload.price)],
                    ['Share of first listing', `${payload[0].payload.pct.toFixed(1)}%`],
                  ]}
                />
              ) : null
            }
          />
          {indexed.map((s, i) => (
            <Line
              key={s.id}
              data={s.points}
              name={s.label}
              dataKey="pct"
              type="stepAfter"
              stroke={SERIES[i % SERIES.length]}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 0, fill: SERIES[i % SERIES.length] }}
              activeDot={{ r: 6, stroke: '#fcfcfb', strokeWidth: 2 }}
              isAnimationActive
              animationDuration={520}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <p className="mt-1 text-[11px] text-ink-muted">
        100% is each car&rsquo;s first asking price. Indexed because absolute prices across a
        219,000 AED coupé and a 47,500 AED saloon make every line look flat. Drawn as steps:
        a price holds until someone changes it, so a sloping line would invent a decline
        that never happened.
      </p>
    </div>
  );
}

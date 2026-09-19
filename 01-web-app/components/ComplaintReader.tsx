'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SeverityIcon } from './icons';

/**
 * Windowed, infinitely-scrolling reader over the complaint set.
 *
 * A 2016 Ford Explorer has 2,448 complaints. Three things keep this smooth:
 *
 * 1. **The server pages it.** Thirty rows per request, sliced from the cache the
 *    analysis already populated — so paging costs no upstream calls and the browser
 *    never holds 2.4MB of JSON.
 * 2. **Windowing.** Only the rows near the viewport are in the DOM. Rows are a fixed
 *    height so the scroll position of any row is arithmetic rather than measurement,
 *    and the spacers above and below keep the scrollbar honest.
 * 3. **Prefetching.** The next page is requested when the viewport passes roughly
 *    two-thirds of what is loaded, so the fetch is usually finished before the reader
 *    reaches the end.
 *
 * Fixed-height rows are the trade-off: summaries are clamped rather than reflowed.
 * Variable heights would need measurement and a position cache, which is a lot of
 * machinery for a reading list.
 */

type Row = {
  id: number;
  component: string;
  filed: string;
  summary: string;
  crash: boolean;
  fire: boolean;
  injuries: number;
  deaths: number;
};

const ROW_H = 132;
const OVERSCAN = 4;
const VIEWPORT_H = 520;

export function ComplaintReader({
  vin,
  component,
  harmOnly,
  onHarmChange,
  onClose,
}: {
  vin: string;
  component?: string;
  /** Owned by the URL, not by this component — see Lookup. A filtered reading of a
   *  car's complaints is a thing worth sending to a colleague, and it cannot be if the
   *  filter only exists in React state. */
  harmOnly: boolean;
  onHarmChange: (next: boolean) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const scroller = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const load = useCallback(
    async (offset: number, replace = false) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const q = new URLSearchParams({ vin, offset: String(offset), limit: '30' });
        if (component) q.set('component', component);
        if (harmOnly) q.set('harm', '1');

        const response = await fetch(`/api/complaints?${q}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load complaints');

        setTotal(body.total);
        setRows((prev) => (replace ? body.rows : [...prev, ...body.rows]));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load complaints');
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [vin, component, harmOnly],
  );

  // Filter changes reset the list rather than appending to a stale one.
  useEffect(() => {
    setRows([]);
    setScrollTop(0);
    if (scroller.current) scroller.current.scrollTop = 0;
    void load(0, true);
     
  }, [vin, component, harmOnly]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setScrollTop(el.scrollTop);

    // Prefetch at two-thirds, so the next page usually lands before it is needed.
    const seen = (el.scrollTop + VIEWPORT_H) / ROW_H;
    if (seen > rows.length * 0.66 && rows.length < total && !loadingRef.current) {
      void load(rows.length);
    }
  };

  const first = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN);
  const visible = rows.slice(first, last);

  return (
    <section className="panel lift overflow-hidden" aria-label="Owner complaints">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline p-4">
        <div className="mr-auto min-w-0">
          <h2 className="text-[15px] font-semibold">
            {component ? `${component} complaints` : 'What owners wrote'}
          </h2>
          <p className="tnum text-[12px] text-ink-muted">
            {total.toLocaleString()} record{total === 1 ? '' : 's'}
            {rows.length < total && ` · ${rows.length} loaded`}
          </p>
        </div>

        <button
          onClick={() => onHarmChange(!harmOnly)}
          aria-pressed={harmOnly}
          className="rounded-full border px-3 py-1 text-[12px] transition-colors"
          style={{
            borderColor: harmOnly ? 'var(--critical)' : 'var(--hairline)',
            color: harmOnly ? 'var(--critical)' : 'var(--ink-secondary)',
          }}
        >
          Crash, fire or injury only
        </button>

        <button onClick={onClose} className="text-[13px] text-ink-muted transition-colors hover:text-ink">
          Close
        </button>
      </div>

      {error && (
        <p className="p-4 text-[13px]" style={{ color: 'var(--critical)' }}>{error}</p>
      )}

      {!error && total === 0 && !loading && (
        <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
          No complaints match this filter.
        </p>
      )}

      <div
        ref={scroller}
        onScroll={onScroll}
        style={{ height: VIEWPORT_H }}
        className="overflow-y-auto overscroll-contain"
      >
        {/* Spacer above keeps the scrollbar proportional to the whole set, not the DOM. */}
        <div style={{ height: first * ROW_H }} aria-hidden />

        <ul>
          {visible.map((r) => {
            const harm = r.crash || r.fire || r.injuries > 0 || r.deaths > 0;
            return (
              <li
                key={r.id}
                style={{ height: ROW_H }}
                className="flex gap-3 border-b border-hairline px-4 py-3"
              >
                <span className="mt-0.5 shrink-0" style={{ color: harm ? 'var(--critical)' : 'var(--ink-muted)' }}>
                  <SeverityIcon level={harm ? 'serious' : 'standard'} />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-muted">
                    <span className="font-medium text-ink-secondary">{r.component}</span>
                    <span className="tnum">{r.filed}</span>
                    {harm && (
                      <span style={{ color: 'var(--critical)' }}>
                        {[r.crash && 'crash', r.fire && 'fire', r.injuries > 0 && `${r.injuries} injured`, r.deaths > 0 && `${r.deaths} died`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </p>
                  {/* Clamped, not reflowed — fixed row heights are what make the
                      windowing arithmetic rather than measurement. */}
                  <p className="mt-1 overflow-hidden text-[13px] leading-relaxed text-ink-secondary"
                     style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' }}>
                    {r.summary}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        {loading && (
          <ul aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} style={{ height: ROW_H }} className="flex gap-3 border-b border-hairline px-4 py-3">
                <div className="skeleton size-4 shrink-0 rounded-full" />
                <div className="flex-1">
                  <div className="skeleton h-3 w-40" />
                  <div className="skeleton mt-2 h-3 w-full" />
                  <div className="skeleton mt-1.5 h-3 w-11/12" />
                  <div className="skeleton mt-1.5 h-3 w-4/5" />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div style={{ height: Math.max(0, (rows.length - last) * ROW_H) }} aria-hidden />

        {rows.length > 0 && rows.length >= total && (
          <p className="px-4 py-4 text-center text-[12px] text-ink-muted">
            That is all {total.toLocaleString()} of them.
          </p>
        )}
      </div>
    </section>
  );
}

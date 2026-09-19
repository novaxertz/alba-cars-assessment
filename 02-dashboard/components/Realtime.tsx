'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Keeps the dashboard current without a refresh.
 *
 * The deliberate choice is what this does NOT do: it holds no copy of the data. A change
 * arrives and it calls `router.refresh()`, so the server components re-query and
 * re-render. Mirroring rows into client state would give days-on-lot, holding cost and
 * the bucket totals a second implementation in JavaScript that can drift from the SQL,
 * and those numbers are the product. So the socket is a notification, not a data
 * channel: it says "something changed" and Postgres stays the only thing computing.
 *
 * The token has to be attached to the socket before subscribing. Realtime evaluates
 * row-level security against the subscriber's JWT, so a channel opened before the
 * session has loaded is treated as anonymous: it subscribes happily, reports SUBSCRIBED,
 * and then silently receives nothing. That is how this failed the first time - a green
 * "Live" badge over a socket delivering nothing, which is worse than an obvious error.
 */
export function Realtime() {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const [changed, setChanged] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const nudge = (label: string) => {
      setChanged(label);
      if (timer.current) clearTimeout(timer.current);
      // Coalesce a burst: the nightly agent writes nine rows in a couple of seconds,
      // which is one logical event, not nine.
      timer.current = setTimeout(() => {
        router.refresh();
        setTimeout(() => setChanged(null), 2500);
      }, 400);
    };

    async function connect() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session?.access_token) {
        await supabase.realtime.setAuth(data.session.access_token);
      }
      if (cancelled) return;

      channel = supabase
        .channel('lot-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' },
          () => nudge('Inventory updated'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'price_changes' },
          () => nudge('Price changed'))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'markdown_recommendations' },
          () => nudge('New markdown recommendation'))
        .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    }

    void connect();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div className="flex items-center gap-2" aria-live="polite">
      {changed && <span className="rise text-[12px] text-ink-secondary">{changed}</span>}
      <span
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted"
        title={live ? 'Connected — this page updates as the data changes' : 'Not connected; the page will not update on its own'}
      >
        <span
          aria-hidden
          className="inline-block size-1.5 rounded-full"
          style={{
            background: live ? 'var(--good)' : 'var(--ink-muted)',
            boxShadow: live ? '0 0 0 3px rgba(12,163,12,0.15)' : 'none',
          }}
        />
        {live ? 'Live' : 'Offline'}
      </span>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Lookup } from './Lookup';
import { Sweep } from './Sweep';

const TABS = [
  { id: 'one' as const, label: 'One car' },
  { id: 'sweep' as const, label: 'Sweep the lot' },
];

export function Workspace() {
  const [mode, setMode] = useState<'one' | 'sweep'>('one');
  const [seed, setSeed] = useState<{ vin: string; label: string } | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  /**
   * Opening a car from the sweep.
   *
   * This runs inside startTransition so the old view stays on screen until the new one
   * is ready, rather than flashing an empty panel. The morph itself is FLIP - the row's
   * rect is measured on click and replayed on the arriving header (lib/flip.ts).
   *
   * It also fixes a real bug: the sweep rows used to be plain links to /?vin=..., which
   * changed the URL while Workspace stayed in sweep mode - so clicking "Detail" did
   * nothing visible at all.
   */
  const openDetail = (vin: string, label: string) => {
    startTransition(() => {
      // The sweep already knows what this car is. Handing that over means the detail
      // view can render its header in the same commit - which is what gives the shared
      // element something to morph INTO. Without it the new tree has no matching
      // `vehicle-<VIN>`, because the real data is still being fetched, and the browser
      // has nothing to animate towards.
      setSeed({ vin, label });
      setMode('one');
      router.replace(`/?vin=${encodeURIComponent(vin)}`, { scroll: false });
    });
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Lookup mode"
        className="mb-4 inline-flex rounded-xl border border-hairline bg-[color:var(--surface)] p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => startTransition(() => { setSeed(null); setMode(tab.id); })}
            className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
              mode === tab.id ? 'bg-[color:var(--surface-lift)] text-ink' : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'one' ? <Lookup seed={seed} /> : <Sweep onOpenDetail={openDetail} />}
    </div>
  );
}

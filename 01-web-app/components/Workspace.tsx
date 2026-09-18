'use client';

import { useState } from 'react';
import { Lookup } from './Lookup';
import { Sweep } from './Sweep';

const TABS = [
  { id: 'one' as const, label: 'One car' },
  { id: 'sweep' as const, label: 'Sweep the lot' },
];

export function Workspace() {
  const [mode, setMode] = useState<'one' | 'sweep'>('one');

  return (
    <div>
      <div role="tablist" aria-label="Lookup mode" className="mb-4 inline-flex rounded-xl border border-hairline bg-[color:var(--surface)] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => setMode(tab.id)}
            className={`rounded-lg px-4 py-2 text-[13px] font-medium transition-colors ${
              mode === tab.id ? 'bg-[color:var(--surface-lift)] text-ink' : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'one' ? <Lookup /> : <Sweep />}
    </div>
  );
}

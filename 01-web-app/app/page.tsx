import { Suspense } from 'react';
import { Lookup } from '@/components/Lookup';
import { LookupSkeleton } from '@/components/Skeletons';
import { summariesEnabled } from '@/lib/summarise';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-5 py-10 sm:py-14">
      <header className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted">
          Recall Radar
        </p>
        <h1 className="mt-2 text-[30px] leading-[1.1] font-semibold tracking-tight sm:text-[38px]">
          Does this car have an open safety recall?
        </h1>
        <p className="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-ink-secondary">
          Decode a VIN and check it against NHTSA&rsquo;s recall database before the car goes on
          the forecourt. An unrepaired recall is a liability to sell — and a negotiating lever
          when you&rsquo;re the one buying.
        </p>
        {!summariesEnabled() && (
          <p className="mt-2 text-[12px] text-ink-muted">
            Running without a model API key, so recall notices appear in NHTSA&rsquo;s own wording
            rather than plain-language summaries. Everything else works.
          </p>
        )}
      </header>

      <Suspense fallback={<LookupSkeleton />}>
        <Lookup />
      </Suspense>

      <footer className="mt-10 border-t border-hairline pt-5 text-[12px] leading-relaxed text-ink-muted">
        <p>
          Data from NHTSA&rsquo;s vPIC decoder and recalls API. <strong className="font-medium text-ink-secondary">US-market
          vehicles only</strong> — a GCC-spec import may decode partially or not at all. Recall
          campaigns are listed by make, model and year; NHTSA does not publish per-VIN repair
          status, so this cannot tell you whether a specific car has already been fixed.
        </p>
      </footer>
    </main>
  );
}

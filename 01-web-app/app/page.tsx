import { Suspense } from 'react';
import { Workspace } from '@/components/Workspace';
import { LookupSkeleton } from '@/components/Skeletons';
import { summariesEnabled } from '@/lib/summarise';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-5 py-10 sm:py-14">
      <header className="mb-7">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted">
          Second Opinion
        </p>
        <h1 className="mt-2 text-[30px] leading-[1.1] font-semibold tracking-tight sm:text-[38px]">
          What the manufacturer admitted, and what owners actually report.
        </h1>
        <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-ink-secondary">
          Paste a VIN. You get the open safety recalls — and the complaints owners filed that
          were <em className="text-ink not-italic">never</em> recalled. The gap between the two is
          what to have inspected before you buy.
        </p>
        {!summariesEnabled() && (
          <p className="mt-2 text-[12px] text-ink-muted">
            Running without a model API key, so recall notices appear in NHTSA&rsquo;s own wording
            rather than plain-language summaries. Everything else works.
          </p>
        )}
      </header>

      <Suspense fallback={<LookupSkeleton />}>
        <Workspace />
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

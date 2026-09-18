'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-16">
      <div className="card rise max-w-md p-6 text-center">
        <h1 className="text-[16px] font-semibold">That didn&rsquo;t load</h1>
        <p className="mt-2 text-[13px] text-ink-secondary">
          The dashboard could not reach its data. The message below is what came back.
        </p>
        <p className="tnum mt-3 rounded-lg bg-[#f5f5f2] px-3 py-2 text-left text-[12px] text-ink-secondary">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-[color:var(--ink)] px-4 py-2 text-[14px] font-medium text-white transition-all hover:bg-[#2b2b2b] active:scale-[0.985]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

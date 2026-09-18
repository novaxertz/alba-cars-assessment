'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-20">
      <div className="panel lift max-w-md p-6 text-center">
        <h1 className="text-[17px] font-semibold">Something broke on our side</h1>
        <p className="mt-2 text-[14px] text-ink-secondary">
          Not NHTSA — this one is ours. The message below is what came back.
        </p>
        <p className="mt-3 rounded-xl bg-[color:var(--canvas)] p-3 text-left text-[12px] text-ink-secondary">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-xl bg-white px-5 py-2.5 text-[14px] font-semibold text-black transition-all hover:bg-[#e9e9e4] active:scale-[0.985]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

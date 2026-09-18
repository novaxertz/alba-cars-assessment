/** Geometry matches the real result, so nothing jumps when data lands. */
export function LookupSkeleton() {
  return (
    <div className="space-y-3" aria-live="polite" aria-busy="true">
      <p className="sr-only">Looking up this VIN with NHTSA</p>

      <div className="h-1 rounded-full sweep-rail" />

      <div className="panel p-5 sm:p-6">
        <div className="flex gap-4">
          <div className="skeleton size-7 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="skeleton h-2.5 w-24" />
            <div className="skeleton mt-2.5 h-6 w-64" />
            <div className="skeleton mt-2.5 h-3 w-full max-w-md" />
          </div>
        </div>
      </div>

      <div className="panel p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton h-2.5 w-14" />
              <div className="skeleton mt-2 h-4 w-20" />
            </div>
          ))}
        </div>
      </div>

      {[0, 1].map((i) => (
        <div key={i} className="panel flex overflow-hidden">
          <div className="skeleton w-1 shrink-0 rounded-none" />
          <div className="flex-1 p-4 sm:p-5">
            <div className="skeleton h-2.5 w-28" />
            <div className="skeleton mt-2.5 h-4 w-3/4" />
            <div className="skeleton mt-2.5 h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

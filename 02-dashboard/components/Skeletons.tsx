/** Skeletons mirror the real layout's geometry, so nothing jumps when data arrives. */
export function TileSkeleton() {
  return (
    <div className="card p-4">
      <div className="skeleton h-3 w-24" />
      <div className="skeleton mt-3 h-6 w-32" />
      <div className="skeleton mt-3 h-3 w-20" />
    </div>
  );
}

export function ChartSkeleton({ title }: { title: string }) {
  return (
    <section className="card p-5">
      <div className="skeleton h-4 w-44" />
      <div className="mt-6 flex h-[196px] items-end gap-3" aria-label={`${title} loading`}>
        {[62, 88, 54, 96, 70, 42].map((h, i) => (
          <div key={i} className="skeleton flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    </section>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-hairline px-5 py-3">
        <div className="skeleton h-4 w-32" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-hairline px-5 py-3.5 last:border-0">
          <div className="skeleton h-4 flex-1" />
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

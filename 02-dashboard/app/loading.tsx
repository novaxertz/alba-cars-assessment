import { ChartSkeleton, TableSkeleton, TileSkeleton } from '@/components/Skeletons';

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <TileSkeleton key={i} />)}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ChartSkeleton title="Where the money is stuck" />
        <ChartSkeleton title="Price decay" />
      </div>
      <div className="mt-4"><TableSkeleton /></div>
    </main>
  );
}

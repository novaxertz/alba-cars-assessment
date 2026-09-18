import { ChartSkeleton, TileSkeleton } from '@/components/Skeletons';

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[900px] flex-1 px-5 py-6">
      <div className="skeleton h-4 w-28" />
      <div className="skeleton mt-4 h-7 w-64" />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <TileSkeleton key={i} />)}
      </div>
      <div className="mt-4"><ChartSkeleton title="Price history" /></div>
    </main>
  );
}

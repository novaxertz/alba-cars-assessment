import Link from 'next/link';
import { aed, bucketColor, type Bucket } from '@/lib/format';

export function StatTile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'critical' | 'plain';
}) {
  return (
    <div className="card rise p-4">
      <p className="text-[12px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className="tnum mt-1.5 text-[26px] leading-none font-semibold"
        style={{ color: tone === 'critical' ? 'var(--critical)' : 'var(--ink)' }}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12px] text-ink-secondary">{sub}</p>}
    </div>
  );
}

export function BucketPill({ bucket }: { bucket: Bucket }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-secondary">
      <span
        aria-hidden
        className="inline-block size-2 rounded-full"
        style={{ background: bucketColor[bucket] }}
      />
      {bucket === '90+' ? '90+ days' : `${bucket} days`}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    available: 'bg-[#eef4fd] text-[#185099]',
    reserved: 'bg-[#fdf3e3] text-[#8a5a00]',
    sold: 'bg-[#eef0ee] text-[#52514e]',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${map[status] ?? map.sold}`}>
      {status}
    </span>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card rise flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div aria-hidden className="mb-1 size-10 rounded-full border border-dashed border-[color:var(--baseline)]" />
      <p className="text-[15px] font-medium">{title}</p>
      <p className="max-w-sm text-[13px] text-ink-secondary">{body}</p>
      {action}
    </div>
  );
}

export function Money({ value, tone }: { value: number; tone?: boolean }) {
  const negative = value < 0;
  return (
    <span
      className="tnum"
      style={{ color: tone && negative ? 'var(--critical)' : undefined }}
    >
      {aed(value)}
    </span>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13px] text-ink-secondary transition-colors hover:text-ink">
      ← {children}
    </Link>
  );
}

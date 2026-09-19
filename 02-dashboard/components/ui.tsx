import Link from 'next/link';
import { aed, bucketColor, type Bucket } from '@/lib/format';

export function StatTile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'critical' | 'plain';
}) {
  return (
    <div className="card rise p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink-muted sm:text-[12px]">{label}</p>
      <p
        className="tnum mt-1.5 text-[20px] leading-tight font-semibold sm:text-[26px] sm:leading-none"
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

/**
 * Stand-in for a vehicle with no photo.
 *
 * Deliberately a drawn silhouette rather than a stock photograph. A real photo of a
 * different car on an inventory row is a small lie that a tired salesperson will
 * eventually act on — this reads immediately as "no photo yet" while still giving the
 * row the shape and weight it has once a picture exists.
 *
 * Inline SVG, so it costs no request and inherits the theme.
 */
export function PhotoPlaceholder({ className = '', label = 'No photo yet' }: { className?: string; label?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`flex items-center justify-center rounded-md border border-dashed border-hairline bg-[#f5f5f2] ${className}`}
    >
      <svg viewBox="0 0 48 24" fill="none" className="h-1/2 w-auto" aria-hidden>
        {/* body */}
        <path
          d="M3 17h42M6 17c0-1.7 1.3-3 3-3s3 1.3 3 3M36 17c0-1.7 1.3-3 3-3s3 1.3 3 3"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
          className="text-[color:var(--ink-muted)]"
        />
        <path
          d="M4 17v-3.5c0-.9.6-1.7 1.5-1.9l4.6-1.1 4-4.1A4 4 0 0 1 17 5h10.6c1 0 2 .4 2.7 1.1l4.3 4.3 5.2 1.2c1 .2 1.7 1.1 1.7 2.1V17"
          stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
          className="text-[color:var(--ink-muted)]"
        />
        {/* windows */}
        <path
          d="M15.5 10.3 18 7.2h8.4l3.1 3.1H15.5Z"
          fill="currentColor" className="text-[color:var(--hairline)]"
        />
      </svg>
    </span>
  );
}

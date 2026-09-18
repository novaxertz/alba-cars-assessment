/** Money is stored as integer AED everywhere. Format at the edge, never compute on strings. */
export const aed = (n: number) =>
  new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n);

/** Compact form for chart axes, where full figures would collide. */
export const aedCompact = (n: number) =>
  new Intl.NumberFormat('en-AE', { notation: 'compact', maximumFractionDigits: 1 }).format(n) + ' AED';

export const BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Ordinal ramp: one hue, light to dark. Ageing is magnitude, not identity. */
export const bucketColor: Record<Bucket, string> = {
  '0-30': 'var(--age-1)',
  '31-60': 'var(--age-2)',
  '61-90': 'var(--age-3)',
  '90+': 'var(--age-4)',
};

export const bucketLabel: Record<Bucket, string> = {
  '0-30': 'Under 30 days',
  '31-60': '31 to 60 days',
  '61-90': '61 to 90 days',
  '90+': 'Over 90 days',
};

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

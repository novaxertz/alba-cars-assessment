/**
 * Severity never rests on colour alone — each level carries its own glyph and a text
 * label. That covers colour-vision deficiency, print, and forced-colors mode.
 */
export function SeverityIcon({ level, className = '' }: { level: 'critical' | 'serious' | 'standard' | 'clear'; className?: string }) {
  const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true, className } as const;

  if (level === 'critical')
    return (
      <svg {...common}>
        <path d="M8 1.6 14.8 13.6H1.2L8 1.6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 6v3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="11.4" r="0.9" fill="currentColor" />
      </svg>
    );

  if (level === 'serious')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 4.8V8.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="10.9" r="0.9" fill="currentColor" />
      </svg>
    );

  if (level === 'clear')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 8.2 7.2 10.4 11 6.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );

  return (
    <svg {...common}>
      <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.4 8h5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

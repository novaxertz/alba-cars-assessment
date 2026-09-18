import { SeverityIcon } from './icons';
import type { Analysis } from '@/lib/analysis';

/**
 * What to actually inspect, ranked by harm then volume.
 *
 * The "no campaign" rows are the point of the whole app: components owners keep
 * reporting that no manufacturer has ever acknowledged. They carry no remedy, no free
 * repair and no paper trail — so they are the ones a buyer pays a mechanic to look at.
 */
export function Findings({ analysis }: { analysis: Analysis }) {
  const rows = analysis.findings.filter((f) => f.complaints > 1).slice(0, 8);
  if (rows.length === 0) return null;

  return (
    <section className="panel lift overflow-hidden" style={{ animationDelay: '120ms' }}>
      <div className="border-b border-hairline p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold">What owners actually report</h2>
        <p className="mt-1 text-[13px] text-ink-secondary">
          {analysis.totalComplaints.toLocaleString()} complaints filed with NHTSA for this model year.
          Ranked by how many involved a crash, fire or injury.
        </p>
      </div>

      <ul className="divide-y divide-[color:var(--hairline)]">
        {rows.map((f) => {
          const unacknowledged = f.verdict === 'unacknowledged';
          return (
            <li key={f.component} className="p-4 sm:px-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-[14px] font-medium">{f.component}</h3>
                {unacknowledged ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ color: 'var(--warning)', background: 'rgba(250,178,25,0.1)' }}
                  >
                    <SeverityIcon level="serious" />
                    No recall covers this
                  </span>
                ) : (
                  <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink-muted">
                    {f.campaigns.length} {f.campaigns.length === 1 ? 'campaign' : 'campaigns'}
                    {f.firstCampaignYear && ` · ${f.firstCampaignYear}${f.lastCampaignYear !== f.firstCampaignYear ? `–${f.lastCampaignYear}` : ''}`}
                  </span>
                )}
              </div>

              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-ink-muted">
                <span className="tnum">{f.complaints} complaints</span>
                {f.harmCount > 0 && (
                  <span className="tnum" style={{ color: 'var(--critical)' }}>
                    {f.harmCount} involved a crash, fire or injury
                    {f.deaths > 0 && ` · ${f.deaths} ${f.deaths === 1 ? 'death' : 'deaths'}`}
                  </span>
                )}
                {f.peakYear && <span className="tnum">peaked {f.peakYear} ({f.peakCount})</span>}
                <span className="tnum">
                  {f.recentComplaints === 0 ? 'none in the last 3 years' : `${f.recentComplaints} in the last 3 years`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {analysis.unacknowledgedShare > 0.1 && (
        <p className="border-t border-hairline p-4 text-[13px] text-ink-secondary sm:px-5">
          <strong className="font-medium text-ink">
            {Math.round(analysis.unacknowledgedShare * 100)}% of complaints
          </strong>{' '}
          concern components with no recall campaign behind them. Those carry no free remedy and
          no paper trail — they are what to have inspected before you buy.
        </p>
      )}
    </section>
  );
}

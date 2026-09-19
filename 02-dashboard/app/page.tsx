import Link from 'next/link';
import Image from 'next/image';
import { getAgeing, getCoverPhotos, getCurrentUser, getDecaySeries, getLatestRecommendations, getSummary } from '@/lib/queries';
import { aed, bucketLabel } from '@/lib/format';
import { AgeingChart, DecayChart } from '@/components/Charts';
import { Recommendations } from '@/components/Recommendations';
import { InventoryHeader } from '@/components/InventoryHeader';
import { Header } from '@/components/Header';
import { BucketPill, EmptyState, Money, PhotoPlaceholder, StatTile, StatusChip } from '@/components/ui';

export default async function DashboardPage() {
  const [user, rows, summary, decay, recommendations] = await Promise.all([
    getCurrentUser(), getAgeing(), getSummary(), getDecaySeries(), getLatestRecommendations(),
  ]);
  // Signed in one batch rather than one request per row.
  const covers = await getCoverPhotos(rows.map((r) => r.id));

  const unsold = rows.filter((r) => r.status !== 'sold');
  const capital = unsold.reduce((n, r) => n + r.acquisition_cost_aed, 0);
  const holding = unsold.reduce((n, r) => n + Number(r.holding_cost_aed), 0);
  const overNinety = unsold.filter((r) => r.ageing_bucket === '90+');
  const bleeding = unsold.filter((r) => r.margin_at_list_aed < 0);

  return (
    <>
      <Header email={user?.email ?? ''} />

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-6">
        <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Capital on the lot" value={aed(capital)} sub={`${unsold.length} unsold vehicles`} />
          <StatTile label="Holding cost to date" value={aed(holding)} sub="Accrued since acquisition" />
          <StatTile label="Over 90 days" value={String(overNinety.length)} sub={overNinety.length ? aed(overNinety.reduce((n, r) => n + r.acquisition_cost_aed, 0)) + ' tied up' : 'Nothing stale'} />
          <StatTile
            label="Below water"
            value={String(bleeding.length)}
            sub={bleeding.length ? 'Asking price no longer covers cost + carry' : 'Every unit still profitable'}
            tone={bleeding.length ? 'critical' : 'plain'}
          />
        </section>

        <section className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="card rise p-5">
            <h2 className="text-[15px] font-semibold">Where the money is stuck</h2>
            <p className="mb-2 text-[12px] text-ink-muted">Acquisition cost of unsold stock, by time on the lot</p>
            {summary.length ? <AgeingChart data={summary} /> : (
              <p className="py-16 text-center text-[13px] text-ink-muted">No unsold inventory to chart.</p>
            )}
          </div>

          <div className="card rise p-5">
            <h2 className="text-[15px] font-semibold">Price decay</h2>
            <p className="mb-2 text-[12px] text-ink-muted">Asking price against days on the lot, for units already marked down</p>
            {decay.length ? <DecayChart series={decay} /> : (
              <p className="py-16 text-center text-[13px] text-ink-muted">Nothing has been marked down yet.</p>
            )}
          </div>
        </section>

        <div className="mt-4">
          <Recommendations rows={recommendations} />
        </div>

        <section className="mt-4" aria-label="Inventory">
          {rows.length === 0 ? (
            <div className="card rise overflow-hidden">
              <InventoryHeader count={0} />
              <EmptyState
                title="No vehicles yet"
                body="Add the first car to the lot and its ageing, holding cost and price history start tracking from the acquisition date."
              />
            </div>
          ) : (
            <div className="card rise overflow-hidden">
              <InventoryHeader count={rows.length} />

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[14px]">
                  <caption className="sr-only">Inventory by time on the lot, oldest first</caption>
                  <thead>
                    <tr className="text-left text-[12px] uppercase tracking-wide text-ink-muted">
                      <th scope="col" className="px-5 py-2.5 font-medium">Vehicle</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Age</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Cost</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Asking</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Holding</th>
                      <th scope="col" className="px-5 py-2.5 text-right font-medium">Margin at list</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-t border-hairline transition-colors hover:bg-[#f5f5f2]">
                        <td className="px-5 py-3">
                          <div className="flex items-start gap-3">
                            {covers.get(r.id) ? (
                              <Image
                                src={covers.get(r.id)!}
                                alt=""
                                width={64}
                                height={48}
                                unoptimized
                                className="h-12 w-16 shrink-0 rounded-md object-cover"
                              />
                            ) : (
                              <PhotoPlaceholder className="h-12 w-16 shrink-0" />
                            )}
                            <div className="min-w-0">
                          <Link href={`/vehicles/${r.id}`} className="font-medium hover:text-[color:var(--accent-ink)]">
                            {r.make} {r.model}
                          </Link>
                          <span className="ml-2 text-[12px] text-ink-muted">{r.year}</span>
                          <span className="ml-2"><StatusChip status={r.status} /></span>
                          <span className="tnum mt-0.5 block text-[12px] text-ink-muted">{r.vin}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="tnum block">{r.days_on_lot}d</span>
                          <BucketPill bucket={r.ageing_bucket} />
                        </td>
                        <td className="tnum px-3 py-3 text-right text-ink-secondary">{aed(r.acquisition_cost_aed)}</td>
                        <td className="tnum px-3 py-3 text-right">{aed(r.list_price_aed)}</td>
                        <td className="tnum px-3 py-3 text-right text-ink-secondary">{aed(Number(r.holding_cost_aed))}</td>
                        <td className="px-5 py-3 text-right font-medium"><Money value={r.margin_at_list_aed} tone /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <p className="mt-4 text-[12px] text-ink-muted">
          Ageing buckets: {Object.values(bucketLabel).join(' · ')}. Holding cost uses the daily rate on your dealer settings.
        </p>
      </main>
    </>
  );
}

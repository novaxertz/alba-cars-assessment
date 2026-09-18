import { notFound } from 'next/navigation';
import { getAgeingRow, getCurrentUser, getPriceHistory, getVehicle } from '@/lib/queries';
import { aed } from '@/lib/format';
import { deleteVehicle } from '@/app/actions';
import { PriceForm, SoldForm } from '@/components/Forms';
import { Header } from '@/components/Header';
import { BackLink, BucketPill, Money, StatTile, StatusChip } from '@/components/ui';

export default async function VehiclePage({ params }: PageProps<'/vehicles/[id]'>) {
  // Next 16: params is a promise.
  const { id } = await params;

  const [user, vehicle, ageing, history] = await Promise.all([
    getCurrentUser(), getVehicle(id), getAgeingRow(id), getPriceHistory(id),
  ]);

  // A vehicle belonging to another dealer is not "forbidden" here, it is invisible —
  // row-level security filters it out, so this is genuinely a 404.
  if (!vehicle || !ageing) notFound();

  const firstPrice = history[0]?.old_price_aed ?? vehicle.list_price_aed;

  return (
    <>
      <Header email={user?.email ?? ''} />

      <main className="mx-auto w-full max-w-[900px] flex-1 px-5 py-6">
        <BackLink href="/">All inventory</BackLink>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">
            {vehicle.make} {vehicle.model} <span className="text-ink-muted">{vehicle.year}</span>
          </h1>
          <StatusChip status={vehicle.status} />
          <BucketPill bucket={ageing.ageing_bucket} />
        </div>
        <p className="tnum mt-1 text-[13px] text-ink-muted">
          {vehicle.vin} · {vehicle.mileage_km.toLocaleString()} km · acquired {vehicle.acquired_at}
        </p>

        <section className="mt-5 grid gap-3 sm:grid-cols-3">
          <StatTile label="Days on lot" value={`${ageing.days_on_lot}`} sub={`Holding cost ${aed(Number(ageing.holding_cost_aed))}`} />
          <StatTile label="Asking price" value={aed(vehicle.list_price_aed)} sub={`Cost ${aed(vehicle.acquisition_cost_aed)}`} />
          <StatTile
            label="Margin at list"
            value={aed(ageing.margin_at_list_aed)}
            sub={ageing.margin_at_list_aed < 0 ? 'Below cost plus carry' : 'After holding cost'}
            tone={ageing.margin_at_list_aed < 0 ? 'critical' : 'plain'}
          />
        </section>

        <section className="card rise mt-4 p-5">
          <h2 className="text-[15px] font-semibold">Price history</h2>
          <p className="mb-3 text-[12px] text-ink-muted">
            Written by a database trigger whenever the list price changes — never by the app directly.
          </p>

          {history.length === 0 ? (
            <p className="rounded-lg bg-[#f5f5f2] px-3 py-6 text-center text-[13px] text-ink-muted">
              Listed at {aed(firstPrice)} and never changed.
            </p>
          ) : (
            <ol className="space-y-0">
              {history.map((h, i) => {
                const delta = h.old_price_aed - h.new_price_aed;
                return (
                  <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 border-t border-hairline py-2.5 first:border-0">
                    <span className="tnum text-[13px] text-ink-muted">{i + 1}</span>
                    <span className="tnum text-[14px] text-ink-secondary line-through">{aed(h.old_price_aed)}</span>
                    <span aria-hidden className="text-ink-muted">→</span>
                    <span className="tnum text-[14px] font-medium">{aed(h.new_price_aed)}</span>
                    <span
                      className="tnum text-[13px]"
                      style={{ color: delta > 0 ? 'var(--critical)' : 'var(--good)' }}
                    >
                      {delta > 0 ? `−${aed(delta)}` : `+${aed(-delta)}`}
                    </span>
                    <span className="ml-auto text-[12px] text-ink-muted">
                      {h.reason.replace('_', ' ')} · {new Date(h.changed_at).toLocaleDateString('en-GB')}
                    </span>
                  </li>
                );
              })}
              <li className="flex items-baseline justify-between border-t border-hairline pt-2.5 text-[13px]">
                <span className="text-ink-secondary">Total markdown from first listing</span>
                <Money value={firstPrice - vehicle.list_price_aed} />
              </li>
            </ol>
          )}
        </section>

        {vehicle.status !== 'sold' && (
          <section className="card rise mt-4 p-5">
            <h2 className="text-[15px] font-semibold">Reprice</h2>
            <p className="mb-3 text-[12px] text-ink-muted">Changing the price here writes a history row automatically.</p>
            <PriceForm id={vehicle.id} current={vehicle.list_price_aed} />

            <div className="mt-6 border-t border-hairline pt-5">
              <h2 className="text-[15px] font-semibold">Mark as sold</h2>
              <p className="mb-3 text-[12px] text-ink-muted">Stops the holding cost accruing on the sale date.</p>
              <SoldForm id={vehicle.id} suggested={vehicle.list_price_aed} />
            </div>
          </section>
        )}

        {vehicle.status === 'sold' && (
          <section className="card rise mt-4 p-5">
            <h2 className="text-[15px] font-semibold">Sold</h2>
            <p className="mt-1 text-[13px] text-ink-secondary">
              Sold on {vehicle.sold_at} for <span className="tnum font-medium">{aed(vehicle.sold_price_aed ?? 0)}</span> after{' '}
              {ageing.days_on_lot} days, carrying {aed(Number(ageing.holding_cost_aed))} of holding cost.
            </p>
          </section>
        )}

        <section className="mt-4 flex items-center justify-between rounded-xl border border-dashed border-hairline px-5 py-4">
          <div>
            <p className="text-[14px] font-medium">Remove from inventory</p>
            <p className="text-[12px] text-ink-muted">Deletes the vehicle and its price history. Cannot be undone.</p>
          </div>
          <form action={deleteVehicle}>
            <input type="hidden" name="id" value={vehicle.id} />
            <button className="rounded-lg border border-[color:var(--critical)] px-3.5 py-2 text-[14px] font-medium text-[color:var(--critical)] transition-colors hover:bg-[#fdf0f0]">
              Delete
            </button>
          </form>
        </section>
      </main>
    </>
  );
}

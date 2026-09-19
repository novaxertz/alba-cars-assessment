'use client';

import { useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import { createVehicle, type ActionState } from '@/app/actions';

const field =
  'w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[14px] outline-none transition-colors placeholder:text-ink-muted focus:border-[color:var(--accent)]';
const label = 'block text-[12px] font-medium text-ink-secondary mb-1';

/**
 * The inventory card's header, and the add-vehicle form it opens.
 *
 * The form used to live in the top bar, which meant opening it pushed the page header to
 * several hundred pixels tall and shoved the whole dashboard down. Adding stock is an
 * inventory action, so it belongs to the inventory panel — and opening it now expands a
 * section that is already about lists of cars, rather than the site chrome.
 */
export function InventoryHeader({ count }: { count: number }) {
  const [state, action, pending] = useActionState(createVehicle, null as ActionState);
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) firstField.current?.focus();
  }, [open]);

  useEffect(() => {
    if (state?.ok) {
      form.current?.reset();
      const t = setTimeout(() => setOpen(false), 900);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3">
        <h2 className="text-[15px] font-semibold">Inventory</h2>
        <p className="mr-auto text-[12px] text-ink-muted">{count} vehicles · oldest first</p>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-[color:var(--baseline)]"
        >
          {open ? 'Cancel' : 'Add vehicle'}
        </button>
      </div>

      {open && (
        <form ref={form} action={action} className="rise border-b border-hairline bg-[#fbfbf9] px-5 py-4">
          {/* Dense two-up on phones, four-up on desktop: nine short fields laid out in
              one column is a scroll, and this form should never be the tallest thing
              on the page. */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
            <div className="col-span-2">
              <label className={label} htmlFor="vin">VIN</label>
              <input ref={firstField} id="vin" name="vin" required className={`${field} tnum font-mono`} placeholder="1FTZR45E36PA12345" />
            </div>
            <div><label className={label} htmlFor="make">Make</label>
              <input id="make" name="make" required className={field} placeholder="Toyota" /></div>
            <div><label className={label} htmlFor="model">Model</label>
              <input id="model" name="model" required className={field} placeholder="Corolla" /></div>
            <div><label className={label} htmlFor="year">Year</label>
              <input id="year" name="year" type="number" required defaultValue={2020} className={`${field} tnum`} /></div>
            <div><label className={label} htmlFor="mileage_km">Mileage (km)</label>
              <input id="mileage_km" name="mileage_km" type="number" required defaultValue={0} className={`${field} tnum`} /></div>
            <div><label className={label} htmlFor="acquired_at">Acquired</label>
              <input id="acquired_at" name="acquired_at" type="date" required className={`${field} tnum`} /></div>
            <div><label className={label} htmlFor="acquisition_cost_aed">Cost (AED)</label>
              <input id="acquisition_cost_aed" name="acquisition_cost_aed" type="number" required className={`${field} tnum`} placeholder="42000" /></div>
            <div><label className={label} htmlFor="list_price_aed">List price (AED)</label>
              <input id="list_price_aed" name="list_price_aed" type="number" required className={`${field} tnum`} placeholder="51000" /></div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[color:var(--ink)] px-4 py-2 text-[14px] font-medium text-white transition-all hover:bg-[#2b2b2b] active:scale-[0.985] disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Add vehicle'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[13px] text-ink-muted transition-colors hover:text-ink"
            >
              Cancel
            </button>

            {state && (
              <p role="status" className="text-[13px]" style={{ color: state.ok ? 'var(--good)' : 'var(--critical)' }}>
                {state.ok ? state.message : state.error}
              </p>
            )}

            <p className="ml-auto text-[12px] text-ink-muted">
              Ageing and holding cost start from the acquisition date.
            </p>
          </div>
        </form>
      )}
    </>
  );
}

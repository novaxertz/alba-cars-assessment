'use client';

import { useActionState } from 'react';
import { createVehicle, markSold, updateListPrice, type ActionState } from '@/app/actions';

const field =
  'w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[14px] outline-none transition-colors placeholder:text-ink-muted focus:border-[color:var(--accent)]';
const label = 'block text-[12px] font-medium text-ink-secondary mb-1';

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className="rise text-[13px]"
      style={{ color: state.ok ? 'var(--good)' : 'var(--critical)' }}
    >
      {state.ok ? state.message : state.error}
    </p>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[color:var(--ink)] px-4 py-2 text-[14px] font-medium text-white transition-all hover:bg-[#2b2b2b] active:scale-[0.985] disabled:opacity-50"
    >
      {pending ? 'Saving…' : children}
    </button>
  );
}

export function PriceForm({ id, current }: { id: string; current: number }) {
  const [state, action, pending] = useActionState(updateListPrice, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className={label} htmlFor="list_price_aed">New list price (AED)</label>
        <input id="list_price_aed" name="list_price_aed" type="number" defaultValue={current} required className={`${field} tnum w-44`} />
      </div>
      <div>
        <label className={label} htmlFor="reason">Reason</label>
        <select id="reason" name="reason" className={`${field} w-48`} defaultValue="manual">
          <option value="manual">Manual</option>
          <option value="scheduled_markdown">Scheduled markdown</option>
          <option value="automation">Automation</option>
        </select>
      </div>
      <Submit pending={pending}>Update price</Submit>
      <Feedback state={state} />
    </form>
  );
}

export function SoldForm({ id, suggested }: { id: string; suggested: number }) {
  const [state, action, pending] = useActionState(markSold, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label className={label} htmlFor="sold_price_aed">Sale price (AED)</label>
        <input id="sold_price_aed" name="sold_price_aed" type="number" defaultValue={suggested} required className={`${field} tnum w-44`} />
      </div>
      <div>
        <label className={label} htmlFor="sold_at">Sale date</label>
        <input id="sold_at" name="sold_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={`${field} tnum`} />
      </div>
      <Submit pending={pending}>Mark sold</Submit>
      <Feedback state={state} />
    </form>
  );
}

export function SignInForm({ action }: { action: (p: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className={label} htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className={field} />
      </div>
      <div>
        <label className={label} htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className={field} />
      </div>
      <div className="flex items-center gap-3 pt-1">
        <Submit pending={pending}>Sign in</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

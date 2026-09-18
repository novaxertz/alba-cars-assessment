'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type ActionState = { ok: boolean; error?: string; message?: string } | null;

/**
 * Validation is hand-rolled rather than pulled from a schema library. The rules here
 * are few and they already exist as CHECK constraints in the database, which is the
 * layer that actually has to hold — this is the friendlier error message in front of
 * it, not the guarantee.
 */
function readVehicle(formData: FormData) {
  const str = (k: string) => String(formData.get(k) ?? '').trim();
  const num = (k: string) => Number(formData.get(k));

  const vin = str('vin').toUpperCase();
  const make = str('make');
  const model = str('model');
  const year = num('year');
  const mileage_km = num('mileage_km');
  const acquired_at = str('acquired_at');
  const acquisition_cost_aed = Math.round(num('acquisition_cost_aed'));
  const list_price_aed = Math.round(num('list_price_aed'));

  if (vin.length < 11 || vin.length > 17) return { error: 'VIN must be 11 to 17 characters.' };
  if (!make || !model) return { error: 'Make and model are both required.' };
  if (!Number.isFinite(year) || year < 1980 || year > 2100) return { error: 'Year looks wrong.' };
  if (!Number.isFinite(mileage_km) || mileage_km < 0) return { error: 'Mileage must be zero or more.' };
  if (!acquired_at) return { error: 'Acquisition date is required.' };
  if (!(acquisition_cost_aed > 0)) return { error: 'Acquisition cost must be above zero.' };
  if (!(list_price_aed > 0)) return { error: 'List price must be above zero.' };

  return { values: { vin, make, model, year, mileage_km, acquired_at, acquisition_cost_aed, list_price_aed } };
}

export async function createVehicle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = readVehicle(formData);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from('vehicles').insert(parsed.values);

  if (error) {
    // 23505 is a unique violation — here it can only be (owner_id, vin).
    if (error.code === '23505') return { ok: false, error: 'That VIN is already on your lot.' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/');
  return { ok: true, message: `${parsed.values.make} ${parsed.values.model} added.` };
}

/**
 * Only the price is written. The history row is the database trigger's job, so this
 * action cannot forget to log — see supabase/migrations/0001_init.sql.
 */
export async function updateListPrice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id') ?? '');
  const list_price_aed = Math.round(Number(formData.get('list_price_aed')));
  const reason = String(formData.get('reason') ?? 'manual');

  if (!(list_price_aed > 0)) return { ok: false, error: 'Price must be above zero.' };

  const supabase = await createClient();
  const { data: current } = await supabase.from('vehicles').select('list_price_aed').eq('id', id).maybeSingle();
  if (!current) return { ok: false, error: 'Vehicle not found.' };
  if (current.list_price_aed === list_price_aed) return { ok: false, error: 'That is already the price.' };

  const { error } = await supabase
    .from('vehicles')
    .update({ list_price_aed, price_change_reason: reason })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  revalidatePath(`/vehicles/${id}`);

  const delta = current.list_price_aed - list_price_aed;
  return {
    ok: true,
    message: delta > 0 ? `Marked down by ${delta.toLocaleString()} AED.` : `Raised by ${(-delta).toLocaleString()} AED.`,
  };
}

export async function markSold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id') ?? '');
  const sold_price_aed = Math.round(Number(formData.get('sold_price_aed')));
  const sold_at = String(formData.get('sold_at') ?? '');

  if (!(sold_price_aed > 0)) return { ok: false, error: 'Sale price must be above zero.' };
  if (!sold_at) return { ok: false, error: 'Sale date is required.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('vehicles')
    .update({ status: 'sold', sold_at, sold_price_aed })
    .eq('id', id);

  if (error) {
    // The sold_after_acquired CHECK fires here if the date precedes acquisition.
    if (error.code === '23514') return { ok: false, error: 'Sale date cannot be before the car was acquired.' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/');
  revalidatePath(`/vehicles/${id}`);
  return { ok: true, message: 'Marked as sold.' };
}

export async function deleteVehicle(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const supabase = await createClient();
  const { error } = await supabase.from('vehicles').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  redirect('/');
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/sign-in');
}

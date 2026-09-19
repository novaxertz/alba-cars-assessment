'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import sharp from 'sharp';
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

const PHOTO_BUCKET = 'vehicle-photos';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Process an upload before it is stored.
 *
 * Three things happen here, and the first is the one that matters:
 *
 * 1. **EXIF is stripped.** A photo taken on a phone on the forecourt carries the
 *    coordinates of the forecourt, the device model, and the time it was taken. sharp
 *    drops all of it unless explicitly asked to keep it, and `.rotate()` applies the
 *    orientation tag first so the picture is not sideways once the tag is gone.
 *    Verified rather than assumed: a test JPEG carrying GPS tags comes out the other
 *    side with no EXIF block at all.
 * 2. **It is resized** to 1600px on the long edge. Nobody needs a 12-megapixel image of
 *    a used Corolla, and a 5MB upload becomes roughly 200KB.
 * 3. **A thumbnail is generated** at 480px for the inventory list, which was previously
 *    signing and serving full-size photos to render them at 64x48.
 *
 * Everything is re-encoded to JPEG. That normalises the format, and re-encoding is also
 * what guarantees the metadata is gone - it is a new file, not an edited one.
 */
async function processImage(file: File) {
  const input = Buffer.from(await file.arrayBuffer());

  const [full, thumb] = await Promise.all([
    sharp(input).rotate().resize(1600, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 82, mozjpeg: true }).toBuffer(),
    sharp(input).rotate().resize(480, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 75, mozjpeg: true }).toBuffer(),
  ]);

  return { full, thumb };
}

/**
 * Upload a photo for a vehicle.
 *
 * The path is `<owner_id>/<vehicle_id>/<random>.<ext>` and the storage policies compare
 * that first segment to auth.uid(), so a dealer cannot write into anyone else's folder
 * even if this action were called with someone else's vehicle id.
 *
 * The checks below are duplicated by the bucket configuration on purpose: the bucket is
 * the guarantee, this is the friendly error. The filename from the browser is never
 * used — it is attacker-controlled and only useful for its extension.
 */
export async function uploadVehiclePhoto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const vehicleId = String(formData.get('vehicle_id') ?? '');
  const file = formData.get('photo');

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose a photo first.' };
  if (!ALLOWED.includes(file.type)) return { ok: false, error: 'JPEG, PNG or WebP only.' };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `That is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is 5MB.` };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'Not signed in.' };

  // Confirm the vehicle is visible to this user before writing anything. RLS would stop
  // the insert anyway; this turns a policy violation into a sentence.
  const { data: vehicle } = await supabase.from('vehicles').select('id').eq('id', vehicleId).maybeSingle();
  if (!vehicle) return { ok: false, error: 'Vehicle not found.' };

  let processed;
  try {
    processed = await processImage(file);
  } catch {
    // A file that claims to be an image and is not will fail here rather than being
    // stored and served to somebody later.
    return { ok: false, error: 'That file could not be read as an image.' };
  }

  const id = crypto.randomUUID();
  const path = `${auth.user.id}/${vehicleId}/${id}.jpg`;
  const thumbPath = `${auth.user.id}/${vehicleId}/${id}-thumb.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, processed.full, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) return { ok: false, error: `Upload failed: ${uploadError.message}` };

  const { error: thumbError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(thumbPath, processed.thumb, { contentType: 'image/jpeg', upsert: false });

  // A missing thumbnail is survivable - the app falls back to the full image - so this
  // does not fail the upload.
  const storedThumb = thumbError ? null : thumbPath;

  // First photo becomes the cover. The partial unique index makes "exactly one cover"
  // a property of the table rather than something this function has to get right.
  const { count } = await supabase
    .from('vehicle_photos')
    .select('id', { count: 'exact', head: true })
    .eq('vehicle_id', vehicleId);

  const { error: rowError } = await supabase.from('vehicle_photos').insert({
    vehicle_id: vehicleId,
    storage_path: path,
    thumb_path: storedThumb,
    is_cover: (count ?? 0) === 0,
  });

  if (rowError) {
    // Do not leave orphaned files behind if the row fails.
    await supabase.storage.from(PHOTO_BUCKET).remove([path, thumbPath]);
    return { ok: false, error: rowError.message };
  }

  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath('/');
  return { ok: true, message: 'Photo added.' };
}

export async function deleteVehiclePhoto(formData: FormData) {
  const id = String(formData.get('photo_id') ?? '');
  const vehicleId = String(formData.get('vehicle_id') ?? '');

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from('vehicle_photos')
    .select('storage_path, thumb_path, is_cover')
    .eq('id', id)
    .maybeSingle();

  if (!photo) return;

  await supabase.from('vehicle_photos').delete().eq('id', id);
  await supabase.storage
    .from(PHOTO_BUCKET)
    .remove([photo.storage_path, photo.thumb_path].filter(Boolean) as string[]);

  // Deleting the cover leaves the vehicle without one, so promote the next photo.
  if (photo.is_cover) {
    const { data: next } = await supabase
      .from('vehicle_photos')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) await supabase.from('vehicle_photos').update({ is_cover: true }).eq('id', next.id);
  }

  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath('/');
}

export async function setCoverPhoto(formData: FormData) {
  const id = String(formData.get('photo_id') ?? '');
  const vehicleId = String(formData.get('vehicle_id') ?? '');

  const supabase = await createClient();
  // Clear first: the partial unique index refuses two covers, so the order matters.
  await supabase.from('vehicle_photos').update({ is_cover: false }).eq('vehicle_id', vehicleId).eq('is_cover', true);
  await supabase.from('vehicle_photos').update({ is_cover: true }).eq('id', id);

  revalidatePath(`/vehicles/${vehicleId}`);
  revalidatePath('/');
}

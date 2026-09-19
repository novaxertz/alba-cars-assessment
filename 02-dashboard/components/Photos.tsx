'use client';

import Image from 'next/image';
import { useActionState, useRef, useState } from 'react';
import { deleteVehiclePhoto, setCoverPhoto, uploadVehiclePhoto, type ActionState } from '@/app/actions';
import { PhotoPlaceholder } from './ui';
import type { SignedPhoto } from '@/lib/types';

/**
 * Photos for a vehicle.
 *
 * The URLs arrive already signed and expire in an hour — the bucket is private, so
 * there is no permanent public address for a dealer's stock photography. That is also
 * why `unoptimized` is set on the images: Next's optimiser would need to fetch and
 * cache them, which defeats the point of a short-lived URL.
 */
/**
 * Downscale in the browser before the file is sent.
 *
 * Not an optimisation - a correctness fix. A Server Action body is capped at 1MB by
 * Next (raised here to 4MB) and around 4.5MB by the platform, so a modern phone photo is
 * rejected before any server code runs: the browser reports an "unexpected response" and
 * nothing appears in the logs, because no function was ever invoked. That is exactly how
 * this failed the first time it was tried on a real device.
 *
 * Drawing to a canvas and re-encoding also drops EXIF as a side effect, but that is NOT
 * relied on - the server re-encodes with sharp regardless. Anything the browser does is
 * a convenience; the guarantee has to live somewhere the user cannot reach.
 */
async function downscale(file: File, maxEdge = 1800): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // let the server reject it with a real message

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.85),
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export function Photos({ vehicleId, photos }: { vehicleId: string; photos: SignedPhoto[] }) {
  const [state, action, pending] = useActionState(uploadVehiclePhoto, null as ActionState);
  const [preparing, setPreparing] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  return (
    <section className="card rise p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Photos</h2>
        <p className="text-[12px] text-ink-muted">
          {photos.length === 0 ? 'None yet' : `${photos.length} · the cover shows on the inventory list`}
        </p>
      </div>

      {photos.length === 0 && (
        <PhotoPlaceholder className="mt-4 aspect-[4/3] w-full max-w-[220px]" label="No photos for this vehicle yet" />
      )}

      {photos.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.id} className="group relative overflow-hidden rounded-xl border border-hairline">
              <Image
                src={photo.url}
                alt=""
                width={400}
                height={300}
                unoptimized
                className="aspect-[4/3] w-full object-cover"
              />

              {photo.is_cover && (
                <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-medium text-ink">
                  Cover
                </span>
              )}

              <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {!photo.is_cover && (
                  <form action={setCoverPhoto}>
                    <input type="hidden" name="photo_id" value={photo.id} />
                    <input type="hidden" name="vehicle_id" value={vehicleId} />
                    <button className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-ink">
                      Make cover
                    </button>
                  </form>
                )}
                <form action={deleteVehiclePhoto} className="ml-auto">
                  <input type="hidden" name="photo_id" value={photo.id} />
                  <input type="hidden" name="vehicle_id" value={vehicleId} />
                  <button className="rounded-md bg-white/95 px-2 py-1 text-[11px] font-medium text-[color:var(--critical)]">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={form}
        action={async (fd) => {
          const picked = fd.get('photo');
          if (picked instanceof File && picked.size > 0) {
            setPreparing(true);
            try {
              fd.set('photo', await downscale(picked));
            } finally {
              setPreparing(false);
            }
          }
          action(fd);
          form.current?.reset();
        }}
        className="mt-4 flex flex-wrap items-center gap-3 border-t border-hairline pt-4"
      >
        <input type="hidden" name="vehicle_id" value={vehicleId} />
        <label className="text-[12px] font-medium text-ink-secondary" htmlFor="photo">
          Add a photo
        </label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="max-w-full text-[13px] file:mr-3 file:rounded-lg file:border file:border-hairline file:bg-surface file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
        />
        <button
          type="submit"
          disabled={pending || preparing}
          className="rounded-lg bg-[color:var(--ink)] px-4 py-2 text-[14px] font-medium text-white transition-all hover:bg-[#2b2b2b] active:scale-[0.985] disabled:opacity-50"
        >
          {preparing ? 'Preparing…' : pending ? 'Uploading…' : 'Upload'}
        </button>

        {state && (
          <p role="status" className="text-[13px]" style={{ color: state.ok ? 'var(--good)' : 'var(--critical)' }}>
            {state.ok ? state.message : state.error}
          </p>
        )}

        <p className="w-full text-[12px] text-ink-muted">
          JPEG, PNG or WebP. Large photos are downscaled in the browser before sending,
          then resized and re-encoded again on the server — which strips EXIF, because a
          phone photo taken on the forecourt carries its coordinates and those are not
          ours to publish. Stored in a private bucket and served through links that
          expire after an hour, never a public URL.
        </p>
      </form>
    </section>
  );
}

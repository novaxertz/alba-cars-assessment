-- Vehicle photos.
--
-- The bucket is PRIVATE. A public bucket would be one line less work and would mean
-- every photo on every dealer's lot is readable by anyone who can guess a URL — which
-- would quietly undo the boundary the rest of this schema spends its time enforcing.
-- Images are served through short-lived signed URLs generated on the server instead.
--
-- Ownership is carried by the object path: <owner_id>/<vehicle_id>/<filename>. The
-- policies below read the first path segment and compare it to auth.uid(), which is the
-- same rule as every other table here, applied to storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-photos',
  'vehicle-photos',
  false,
  5 * 1024 * 1024,                                  -- 5MB: a forecourt photo, not a raw
  array['image/jpeg', 'image/png', 'image/webp']    -- no SVG: it can carry script
)
on conflict (id) do nothing;

-- Read your own photos.
create policy "dealers read their own vehicle photos"
  on storage.objects for select
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Upload only into your own folder. The WITH CHECK is what stops a dealer writing into
-- somebody else's path.
create policy "dealers upload into their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dealers replace their own vehicle photos"
  on storage.objects for update
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "dealers delete their own vehicle photos"
  on storage.objects for delete
  using (
    bucket_id = 'vehicle-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A row per photo, so the app can order them, pick a cover, and delete both sides
-- together. The storage object is the file; this is what the application knows about it.
create table vehicle_photos (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles (id) on delete cascade,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null unique,
  is_cover    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index vehicle_photos_vehicle_idx on vehicle_photos (vehicle_id, created_at);

-- Exactly one cover per vehicle, enforced rather than hoped for.
create unique index vehicle_photos_one_cover
  on vehicle_photos (vehicle_id)
  where is_cover;

alter table vehicle_photos enable row level security;

create policy photos_select_own on vehicle_photos
  for select using (owner_id = auth.uid());
create policy photos_insert_own on vehicle_photos
  for insert with check (owner_id = auth.uid());
create policy photos_update_own on vehicle_photos
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy photos_delete_own on vehicle_photos
  for delete using (owner_id = auth.uid());

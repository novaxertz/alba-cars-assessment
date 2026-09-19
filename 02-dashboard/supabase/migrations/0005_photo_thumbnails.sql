-- Thumbnails.
--
-- The inventory list shows a cover photo per row. Without this it signs and serves the
-- full-size upload for every row - a 5MB forecourt photo rendered at 64x48 - which is
-- wasteful on a phone and slow on a lot of any size.
--
-- The thumbnail is generated on upload and stored as its own object, so the list can
-- sign the small one and the detail page the large one.

alter table vehicle_photos
  add column if not exists thumb_path text;

-- Photos uploaded before this migration have no thumbnail; the app falls back to the
-- full image for those rather than showing nothing.
comment on column vehicle_photos.thumb_path is
  'Storage path of the generated thumbnail. Null for photos uploaded before thumbnails existed.';

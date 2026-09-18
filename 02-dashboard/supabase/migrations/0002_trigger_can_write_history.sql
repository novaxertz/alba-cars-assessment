-- The price-history trigger could not write.
--
-- price_changes has RLS enabled and deliberately carries no INSERT policy: that is what
-- stops a client forging price history. But a trigger function runs with the privileges
-- of the user whose statement fired it, so the same missing policy also blocked the
-- trigger, and every reprice failed with:
--
--   new row violates row-level security policy for table "price_changes"
--
-- Seeding never hit this because the service-role key bypasses RLS altogether. It only
-- appeared when a signed-in user repriced a car through the app.
--
-- The fix is privilege rather than policy. SECURITY DEFINER lets the trigger — and only
-- the trigger — write history, while clients still have no INSERT path of any kind.
--
-- This does not widen access. The function writes owner_id = NEW.owner_id, and a caller
-- can only reach this trigger by updating a vehicle row that vehicles_update_own already
-- lets them update; its WITH CHECK also prevents reassigning owner_id to anyone else.
-- So the history row can only ever be attributed to the caller.

create or replace function log_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.list_price_aed is distinct from old.list_price_aed then
    insert into price_changes (vehicle_id, owner_id, old_price_aed, new_price_aed, reason)
    values (new.id, new.owner_id, old.list_price_aed, new.list_price_aed, new.price_change_reason);
  end if;
  return new;
end;
$$;

-- Realtime.
--
-- Postgres only streams changes for tables in a publication, so realtime is opt-in per
-- table rather than a global switch. Three are added here, and the omissions are
-- deliberate: profiles and dealer_settings change almost never, and streaming them would
-- be noise on the wire for no benefit.
--
-- Row-level security still applies. Supabase evaluates the subscriber's policies against
-- each change before delivering it, so one dealer's client is never sent another
-- dealer's rows - the same boundary as the REST API, on the socket. That is checked in
-- scripts/verify-rls.mjs rather than assumed.
--
-- REPLICA IDENTITY FULL is needed for DELETE and UPDATE events to carry the old row.
-- Without it a delete arrives as a bare primary key, which is enough to know something
-- vanished but not enough to know whose it was - and therefore not enough for RLS to
-- decide who should hear about it.

alter table vehicles replica identity full;
alter table price_changes replica identity full;
alter table markdown_recommendations replica identity full;

alter publication supabase_realtime add table vehicles;
alter publication supabase_realtime add table price_changes;
alter publication supabase_realtime add table markdown_recommendations;

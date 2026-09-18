-- Inventory ageing & price decay — initial schema
--
-- Design notes that matter when reading this:
--   * All money is INTEGER whole dirhams (AED). Never float, never numeric here.
--   * price_changes is append-only and written by a TRIGGER, not by the client, so the
--     decay curve cannot be corrupted by a caller that forgets to log.
--   * The ageing view and the summary RPC both run as the CALLER (security_invoker /
--     security invoker), so row-level security is re-evaluated for whoever asks. A
--     normal view would run as its creator and happily aggregate everyone's rows.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums

create type vehicle_status      as enum ('available', 'reserved', 'sold');
create type price_change_reason as enum ('manual', 'scheduled_markdown', 'automation');

-- ---------------------------------------------------------------- profiles

create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  role       text not null default 'sales' check (role in ('sales', 'manager')),
  created_at timestamptz not null default now()
);

-- Every auth user gets a profile row automatically. SECURITY DEFINER because it writes
-- on behalf of a user who does not exist yet at the moment the trigger fires.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- dealer settings

-- One configurable daily carrying cost per user. A real floor-plan model would vary by
-- lender, value and tenor; that is explicitly out of scope for the time-box.
create table dealer_settings (
  owner_id                uuid primary key references auth.users (id) on delete cascade,
  daily_holding_cost_aed  integer not null default 45 check (daily_holding_cost_aed >= 0),
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------- vehicles

create table vehicles (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vin                  text not null check (length(vin) between 11 and 17),
  make                 text not null,
  model                text not null,
  year                 integer not null check (year between 1980 and 2100),
  mileage_km           integer not null check (mileage_km >= 0),
  acquired_at          date    not null,
  acquisition_cost_aed integer not null check (acquisition_cost_aed > 0),
  list_price_aed       integer not null check (list_price_aed > 0),
  price_change_reason  price_change_reason not null default 'manual',
  status               vehicle_status not null default 'available',
  sold_at              date,
  sold_price_aed       integer check (sold_price_aed > 0),
  created_at           timestamptz not null default now(),

  -- the same VIN cannot be on one dealer's lot twice
  unique (owner_id, vin),

  -- a car is either sold, with both sale fields present, or it is not sold and has neither
  constraint sold_fields_consistent check (
    (status =  'sold' and sold_at is not null and sold_price_aed is not null) or
    (status <> 'sold' and sold_at is     null and sold_price_aed is     null)
  ),

  constraint sold_after_acquired check (sold_at is null or sold_at >= acquired_at)
);

create index vehicles_owner_status_idx on vehicles (owner_id, status);
create index vehicles_acquired_idx     on vehicles (owner_id, acquired_at);

-- ---------------------------------------------------------------- price history

create table price_changes (
  id             uuid primary key default gen_random_uuid(),
  vehicle_id     uuid not null references vehicles (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  old_price_aed  integer not null check (old_price_aed > 0),
  new_price_aed  integer not null check (new_price_aed > 0),
  reason         price_change_reason not null default 'manual',
  changed_at     timestamptz not null default now(),

  constraint price_actually_changed check (new_price_aed <> old_price_aed)
);

create index price_changes_vehicle_idx on price_changes (vehicle_id, changed_at);

-- The history row is a property of the data, not of the caller's diligence.
create function log_price_change()
returns trigger
language plpgsql
as $$
begin
  if new.list_price_aed is distinct from old.list_price_aed then
    insert into price_changes (vehicle_id, owner_id, old_price_aed, new_price_aed, reason)
    values (new.id, new.owner_id, old.list_price_aed, new.list_price_aed, new.price_change_reason);
  end if;
  return new;
end;
$$;

create trigger vehicles_log_price_change
  after update of list_price_aed on vehicles
  for each row execute function log_price_change();

-- ---------------------------------------------------------------- row-level security

alter table profiles        enable row level security;
alter table dealer_settings enable row level security;
alter table vehicles        enable row level security;
alter table price_changes   enable row level security;

create policy profiles_select_own on profiles
  for select using (id = auth.uid());
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy settings_all_own on dealer_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy vehicles_select_own on vehicles
  for select using (owner_id = auth.uid());
create policy vehicles_insert_own on vehicles
  for insert with check (owner_id = auth.uid());
create policy vehicles_update_own on vehicles
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy vehicles_delete_own on vehicles
  for delete using (owner_id = auth.uid());

-- History is readable but never editable by hand: the trigger is the only writer.
-- No insert/update/delete policy exists, so those are denied for everyone.
create policy price_changes_select_own on price_changes
  for select using (owner_id = auth.uid());

-- ---------------------------------------------------------------- ageing view

-- security_invoker: RLS is re-evaluated for the caller. Without it this view would run
-- as its creator and leak every dealer's inventory through the aggregate.
create view vehicle_ageing with (security_invoker = true) as
select
  v.id,
  v.owner_id,
  v.vin,
  v.make,
  v.model,
  v.year,
  v.status,
  v.acquired_at,
  v.acquisition_cost_aed,
  v.list_price_aed,

  -- a sold car stops accruing on the day it sold
  (coalesce(v.sold_at, current_date) - v.acquired_at)::integer as days_on_lot,

  (coalesce(v.sold_at, current_date) - v.acquired_at)
    * coalesce(s.daily_holding_cost_aed, 45)                    as holding_cost_aed,

  coalesce(h.total_markdown_aed, 0)                             as total_markdown_aed,

  -- what is actually left if it sells at today's asking price
  v.list_price_aed
    - v.acquisition_cost_aed
    - (coalesce(v.sold_at, current_date) - v.acquired_at)
      * coalesce(s.daily_holding_cost_aed, 45)                  as margin_at_list_aed,

  case
    when (coalesce(v.sold_at, current_date) - v.acquired_at) <= 30 then '0-30'
    when (coalesce(v.sold_at, current_date) - v.acquired_at) <= 60 then '31-60'
    when (coalesce(v.sold_at, current_date) - v.acquired_at) <= 90 then '61-90'
    else '90+'
  end                                                           as ageing_bucket
from vehicles v
left join dealer_settings s on s.owner_id = v.owner_id
left join lateral (
  select sum(pc.old_price_aed - pc.new_price_aed)::integer as total_markdown_aed
  from price_changes pc
  where pc.vehicle_id = v.id
) h on true;

-- ---------------------------------------------------------------- summary RPC

-- SECURITY INVOKER (the default, stated here because it is the point): the aggregate
-- must not become a hole in the boundary the tables enforce.
create function inventory_ageing_summary()
returns table (
  ageing_bucket     text,
  vehicle_count     bigint,
  capital_aed       bigint,
  holding_cost_aed  bigint,
  markdown_aed      bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.ageing_bucket,
    count(*)                          as vehicle_count,
    sum(a.acquisition_cost_aed)::bigint as capital_aed,
    sum(a.holding_cost_aed)::bigint     as holding_cost_aed,
    sum(a.total_markdown_aed)::bigint   as markdown_aed
  from vehicle_ageing a
  where a.status <> 'sold'
  group by a.ageing_bucket
  order by
    case a.ageing_bucket
      when '0-30'  then 1
      when '31-60' then 2
      when '61-90' then 3
      else 4
    end;
$$;

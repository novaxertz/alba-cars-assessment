-- Where the nightly markdown agent (../03-n8n-workflow) writes its recommendations.
--
-- The idempotency guarantee lives here, not in the workflow. A unique constraint on
-- (vehicle_id, run_date) means a re-run, a double fire of the schedule, or a manual
-- execution on the same day cannot create a second row — the insert is refused by the
-- database. The workflow does not have to be careful; it is made safe by the schema.
--
-- This is the same shape as guarding webhook replays by inserting the event id under a
-- unique constraint before doing any work: correctness comes from a constraint the
-- caller cannot forget, not from a check the caller has to remember.

create type markdown_severity as enum ('watch', 'act', 'urgent');

create table markdown_recommendations (
  id                     uuid primary key default gen_random_uuid(),
  vehicle_id             uuid not null references vehicles (id) on delete cascade,
  owner_id               uuid not null references auth.users (id) on delete cascade,

  -- the day the agent ran, not a timestamp: two runs on one day are the same run
  run_date               date not null default current_date,

  days_on_lot            integer not null check (days_on_lot >= 0),
  holding_cost_aed       integer not null,
  current_price_aed      integer not null check (current_price_aed > 0),
  recommended_price_aed  integer not null check (recommended_price_aed > 0),
  severity               markdown_severity not null,
  rationale              text not null,
  applied                boolean not null default false,
  created_at             timestamptz not null default now(),

  -- THE idempotency guard
  constraint one_recommendation_per_vehicle_per_day unique (vehicle_id, run_date),

  -- a recommendation that raises the price is a bug, not a markdown
  constraint recommendation_is_a_markdown check (recommended_price_aed <= current_price_aed)
);

create index markdown_recommendations_owner_idx on markdown_recommendations (owner_id, run_date desc);

alter table markdown_recommendations enable row level security;

-- Dealers read their own recommendations. Nobody writes them by hand: there is no
-- insert, update or delete policy, so the only writer is the automation using the
-- service-role key. Same reasoning as price_changes.
create policy recommendations_select_own on markdown_recommendations
  for select using (owner_id = auth.uid());

-- Applying a recommendation is a human decision, so that one column is writable.
create policy recommendations_mark_applied on markdown_recommendations
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

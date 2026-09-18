# Lot — inventory ageing & price decay

A used car costs money every day it sits. Floor-plan interest, depreciation, space on
the forecourt. Dealers know this in the abstract and still cannot answer the question
the weekly pricing review actually asks: **which specific units are bleeding, and which
should be discounted or wholesaled now?**

A stock list shows what is in the yard. This shows what it is costing.

**Live:** _(deployed URL)_ · **Build log:** [BUILD_LOG.md](./BUILD_LOG.md) ·
**Security boundary:** [docs/security-boundary.md](./docs/security-boundary.md)

---

## A way in

Two dealers, each with their own inventory, so you can see that neither can read the
other's rows.

| | Email | Password |
|---|---|---|
| Dealer A — Al Quoz, 10 vehicles | `dealer.a@albademo.test` | `demo-gUlWfgnl4mi7fW` |
| Dealer B — Deira, 3 vehicles | `dealer.b@albademo.test` | `demo-MlwR1EIbOwcuex` |

Throwaway accounts on a throwaway project. Sign in as A, and the 148-day Lexus at the
top of the list is the point of the whole app: it has already eaten its own profit in
carrying cost.

---

## Features

- **Ageing and carrying cost per vehicle** — days on lot, holding cost accrued, total
  markdown to date, and margin at today's asking price. A sold car stops accruing on the
  day it sold.
- **Two charts that answer questions**, not decoration:
  - *Where the money is stuck* — acquisition cost of unsold stock by ageing bucket, so
    you can see which band of the lot your capital is trapped in.
  - *Price decay* — asking price against days on lot, indexed to each car's first
    listing, for units already marked down.
- **Full CRUD** — add a vehicle, reprice it, mark it sold, delete it, each with inline
  success and failure feedback.
- **Price history that cannot be forged or forgotten** — an append-only log written by a
  database trigger, never by the application.
- **Per-dealer isolation** — auth plus row-level security, with the boundary proved by a
  script rather than asserted.
- Skeleton loading states that mirror the real layout, empty states, an error boundary
  that shows what actually came back, and a responsive layout down to phone width.

---

## Backend choice: Supabase, and why

The interesting part of this problem is **aggregation**: days on lot, holding cost
accrued, markdown to date, bucketing by age. That is date arithmetic and grouping, which
is Postgres's home ground — so the backend that is "just Postgres with auth and an API
on top" is the one that lets the database do the work.

Considered and rejected:

- **Convex** — excellent realtime out of the box. But nothing here needs realtime: a
  pricing review is a thing you sit down and do, not a live feed. It would have cost me
  SQL views and functions, which is where the actual value of this app lives.
- **Appwrite** — pleasant all-in-one, but its querying is document-shaped, and I would
  have ended up computing ageing in the browser, which is the thing I specifically
  wanted to avoid.

Row-level security also mattered. Per-dealer isolation expressed as a policy on the
table is enforced for every caller — the REST API, the dashboard, and the n8n workflow
in `../03-n8n-workflow` — rather than re-implemented in each of them.

---

## Data model

```mermaid
erDiagram
    auth_users ||--|| profiles : "has"
    auth_users ||--o| dealer_settings : "configures"
    auth_users ||--o{ vehicles : "owns"
    vehicles ||--o{ price_changes : "logs"

    profiles {
        uuid id PK_FK
        text full_name
        text role "sales | manager"
        timestamptz created_at
    }
    dealer_settings {
        uuid owner_id PK_FK
        integer daily_holding_cost_aed "default 45"
        timestamptz updated_at
    }
    vehicles {
        uuid id PK
        uuid owner_id FK
        text vin "unique per owner, 11-17 chars"
        text make
        text model
        integer year "1980-2100"
        integer mileage_km
        date acquired_at
        integer acquisition_cost_aed "whole AED"
        integer list_price_aed "whole AED"
        enum price_change_reason "manual | scheduled_markdown | automation"
        enum status "available | reserved | sold"
        date sold_at "null unless sold"
        integer sold_price_aed "null unless sold"
        timestamptz created_at
    }
    price_changes {
        uuid id PK
        uuid vehicle_id FK
        uuid owner_id FK
        integer old_price_aed
        integer new_price_aed
        enum reason
        timestamptz changed_at
    }
```

### Field notes that matter

- **All money is `integer` whole dirhams.** Never `float`, never `numeric`. Prices here
  are whole dirhams and float money is a rounding bug waiting for a reason to appear.
- **`vehicles` has a `unique (owner_id, vin)`** — the same VIN cannot be on one dealer's
  lot twice, while two dealers could legitimately have records of the same car.
- **`sold_fields_consistent` CHECK** — a car is either sold with both `sold_at` and
  `sold_price_aed` present, or not sold with neither. The status and the sale data cannot
  drift apart.
- **`sold_after_acquired` CHECK** — a car cannot be sold before it was bought. This one
  fires in the UI as a friendly message if you try.
- **`price_changes` is append-only** and has a `price_actually_changed` CHECK, so a
  no-op update never litters the history.

### Relationships

`price_changes.vehicle_id → vehicles.id` (one-to-many, `on delete cascade`).
Ownership on both tables is `owner_id → auth.users.id`.

---

## Services used

**No storage buckets.** Nothing in this app needs file uploads — vehicle photography is
explicitly out of scope — so there are no buckets and no bucket access rules to get
wrong.

**Database functions and views** (all in `supabase/migrations/`):

| Object | Kind | What it does |
|---|---|---|
| `handle_new_user()` | trigger fn, `SECURITY DEFINER` | Creates a `profiles` row for every new auth user. Definer because it writes for a user who does not exist yet when it fires. |
| `log_price_change()` | trigger fn, `SECURITY DEFINER` | Writes the `price_changes` row whenever `list_price_aed` changes. See the build log for why this one has to be definer. |
| `vehicle_ageing` | view, `security_invoker = true` | Days on lot, holding cost, markdown to date, margin at list, ageing bucket. |
| `inventory_ageing_summary()` | function, `SECURITY INVOKER`, `stable` | Per-bucket aggregates: count, capital, holding cost, markdown. Feeds the first chart. |

**Auth:** Supabase email/password. Session refresh in `proxy.ts` (Next.js 16's rename of
`middleware.ts`).

---

## Architecture

```
Browser ──► Next.js Server Components ──► Supabase PostgREST ──► Postgres + RLS
                     │                                              │
                     └── Server Actions (writes) ───────────────────┘
                                                        trigger writes price history
```

- **Every read and write uses the caller's session and the anon key.** There is no
  service-role key anywhere in the application — not in a route handler, not in a server
  action. Server code is not a reason to bypass the boundary the database enforces, and
  keeping it out means a bug in application code cannot widen access.
- **Derived numbers are computed in Postgres**, not in the browser. The client renders
  `days_on_lot` and `holding_cost_aed`; it never calculates them.
- **`proxy.ts` is convenience, not security.** It refreshes the session and redirects
  signed-out visitors. Delete it and row-level security still prevents one dealer reading
  another's rows.
- The service-role key is used by exactly two things, both of them scripts you run
  yourself: the seed and the boundary verification.

---

## Advanced features, and how they were verified

Three: **auth**, **row-level security**, and **server-computed analytics**.

The full verification write-up is in
[docs/security-boundary.md](./docs/security-boundary.md); the short version:

`npm run verify:rls` signs in as dealer A with **nothing but the anon key** — exactly
what a browser has — and tries ten ways to reach dealer B's data: by owner id, by exact
primary key, unfiltered, through price history, through the ageing view, through the
summary RPC, by update, by insert-as-someone-else, by forging history, and signed out
entirely. All ten come back empty or refused.

The three read paths are checked **separately**, because they fail independently:

| Path | Protected by |
|---|---|
| `vehicles`, `price_changes` | their RLS policies |
| `vehicle_ageing` | `WITH (security_invoker = true)` |
| `inventory_ageing_summary()` | running `SECURITY INVOKER` |

That distinction is the whole point. A plain Postgres view runs with its **creator's**
privileges, so an aggregate built over RLS-protected tables will happily return totals
covering every dealer's inventory while the tables underneath look perfectly locked. The
RPC check compares its total against dealer A's true unsold count — if the view or the
function leaked, that number comes back too high rather than erroring.

It is a script and not a screenshot because a policy added later could regress it.

---

## Run it from zero

### 1. Provision the backend

Create a project at [supabase.com](https://supabase.com), then in the SQL editor run,
in order:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_trigger_can_write_history.sql
```

That is the entire backend: tables, enums, constraints, indexes, RLS policies, the
ageing view and the summary function. Nothing is configured by hand in the dashboard.

### 2. Configure

```bash
cp .env.example .env.local
```

Fill in from **Settings → Data API** and **Settings → API Keys**:

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | Safe in the browser; RLS is what protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key | **Bypasses RLS.** Scripts only, never `NEXT_PUBLIC_`, never committed |
| `SEED_USER_*` | your choice | Credentials the seed will create |

`.env.local` is gitignored. `.env.example` holds placeholders only — there are no real
keys anywhere in this repository.

### 3. Seed and run

```bash
npm install
npm run seed          # two dealers, 13 vehicles, with realistic price history
npm run verify:rls    # the ten boundary checks — all should PASS
npm run dev
```

Then sign in with either account above.

**One gotcha on a fresh clone:** `npx next typegen` has to run before `tsc --noEmit`
passes, because Next 16 generates route type helpers such as `LayoutProps` rather than
exporting them. `npm run typecheck` does both in the right order.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run seed` | Create/refresh the two demo dealers and their inventory. Re-runnable. |
| `npm run verify:rls` | Prove one dealer cannot read the other's data |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |

### A note on the seed

The seed applies markdowns as **ordinary price updates**, so the history is written by
the same trigger the live app uses rather than inserted directly. It then backdates those
history timestamps across each car's time on the lot — the trigger stamps `now()`, which
would otherwise pile every markdown onto today and turn the decay chart into one straight
interpolation. Only the seed does this, using the service role; the application can never
rewrite a timestamp.

---

## Known limitations

Also in [BUILD_LOG.md](./BUILD_LOG.md), kept here because they are worth seeing before
you judge the app.

- **Holding cost is one configurable AED/day figure per dealer.** Real floor-plan cost
  varies by lender, vehicle value and tenor. Out of scope for the time-box, and the
  number is deliberately visible in dealer settings rather than buried in a formula.
- **`margin_at_list_aed` ignores reconditioning, registration and transport**, so it is
  optimistic in absolute terms. It is still directionally right, which is what comparing
  units by age needs.
- **No dark mode.** A second palette validated against a dark surface is real work, and
  I would rather ship one excellent theme than two mediocre ones.
- **No realtime.** Open two tabs and the second will not update until it revalidates.
  Deliberate — see the backend choice above.
- **Dealer settings have no UI yet.** The daily holding rate is seeded and editable in
  the database, not in the app.
- **Seeded VINs are synthetic** and will not decode in the recall checker in
  `../01-web-app`.
- **The boundary check covers the PostgREST surface only** — what a browser can reach.
  Direct database connections are protected by the database password instead. See
  `docs/security-boundary.md` for the full list of what is not covered.

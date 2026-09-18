# Build Log: Inventory Ageing & Price Decay

## Goal & scope decision

A used car is a depreciating asset with a daily carrying cost. Stock lists tell a
dealer what is in the yard; they do not tell them what it is *costing*. This dashboard
answers the weekly pricing-review question — which specific units are bleeding, and
which should be discounted or wholesaled now.

Two related entities: `vehicles`, and an append-only `price_changes` log whose rows are
the price-decay curve. Deliberately left out to fit the time-box: photo uploads,
realtime subscriptions, a true floor-plan financing model (one configurable daily
holding rate stands in), market-price benchmarking, multi-branch hierarchy.

## Stack & tooling

- **Supabase** — chosen over Appwrite and Convex because the interesting part of this
  problem is *aggregation*: days-on-lot, holding cost, markdown-to-date. Those are
  window functions and date arithmetic, which is Postgres's home ground. Convex would
  have given realtime out of the box, but nothing here needs realtime, and it would
  have cost me the SQL.
- Migrations as plain SQL in `supabase/migrations/`, so the whole backend can be
  provisioned from scratch with one command and reviewed as text.

## Key decisions & trade-offs

*(appended as the work happens — see timestamps)*

### 16:27 — Money as integers

Decision: every money column is `integer` AED, never `numeric` or `float`. Prices here
are whole dirhams; float money is a bug waiting for a rounding edge. Alternative
considered: `numeric(12,2)`, which is correct but buys precision this domain does not
use and invites accidental float maths in the client.

### 16:31 — Price history as an event log, written by a trigger

Decision: `price_changes` is append-only, and rows are written by a database trigger on
`vehicles.list_price_aed` rather than by the client.

Why: if the client writes both the new price and the history row, any code path that
forgets the second write silently corrupts the decay curve — and the curve is the whole
point of the dashboard. A trigger makes the history a property of the data, not of the
caller's diligence. It also means the n8n workflow in `03` gets correct history for
free when it applies a markdown, without duplicating that logic in a second place.

Alternative considered: writing both from the client in a transaction. Honest and
simpler to read, but it puts an invariant in the least reliable place.

### 16:34 — `security_invoker` on the view, and why the RPC is not `SECURITY DEFINER`

Decision: the `vehicle_ageing` view is declared `WITH (security_invoker = true)`, and
`inventory_ageing_summary()` runs as the *caller*, not the definer.

Why: this is the exact place a row-level-security boundary usually leaks. A normal
Postgres view runs with the privileges of whoever created it, so an aggregate over an
RLS-protected table can happily return totals covering everybody's rows — the table is
locked but the summary is not. Declaring the view `security_invoker` and leaving the
function `SECURITY INVOKER` means RLS is re-evaluated for the person asking, so the
aggregate can only ever total that person's own inventory.

This is also what makes the boundary worth *testing* rather than asserting: the
verification below queries the table, the view and the RPC as user A against user B's
data, because the three can fail independently.

### 16:52 — Next.js 16, and reading the docs before writing code

The scaffold ships an `AGENTS.md` that says, bluntly, that this is not the Next.js in
my training data and to read `node_modules/next/dist/docs/` first. Two changes here
would have cost real debugging time:

- `middleware.ts` is now `proxy.ts`, with the exported function renamed to match, and
  the edge runtime is not supported there.
- Synchronous `cookies()` is gone. Every request API is async, so the Supabase server
  client factory has to be `async` and `await cookies()`.

Both land exactly on the Supabase session wiring, which is the first thing this app
needs. Reading first cost about eight minutes; finding them by debugging would have
cost more.

## Hard parts / dead ends

### 16:53 — `LayoutProps` is generated, not imported

First typecheck failed with `Cannot find name 'LayoutProps'` in the generated layout.
Next 16 generates route type helpers rather than exporting them, so `npx next typegen`
has to run before `tsc --noEmit` passes on a fresh checkout. Worth knowing for CI and
for anyone running the repo from scratch — it is in the README's setup steps.

## How I verified it works

*(appended as it happens)*

## Known limitations

*(appended as they appear)*

## Time spent

- 16:25–16:40 — problem framing, schema, RLS, view, RPC, seed and verification scripts.
- 16:40–16:55 — Next.js 16 scaffold, Supabase client/server/proxy wiring, docs reading.

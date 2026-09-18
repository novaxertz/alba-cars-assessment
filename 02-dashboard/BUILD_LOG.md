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

*(appended as each decision is made, not reconstructed afterwards)*

### Money as integers

Decision: every money column is `integer` AED, never `numeric` or `float`. Prices here
are whole dirhams; float money is a bug waiting for a rounding edge. Alternative
considered: `numeric(12,2)`, which is correct but buys precision this domain does not
use and invites accidental float maths in the client.

### Price history as an event log, written by a trigger

Decision: `price_changes` is append-only, and rows are written by a database trigger on
`vehicles.list_price_aed` rather than by the client.

Why: if the client writes both the new price and the history row, any code path that
forgets the second write silently corrupts the decay curve — and the curve is the whole
point of the dashboard. A trigger makes the history a property of the data, not of the
caller's diligence. It also means the n8n workflow in `03` gets correct history for
free when it applies a markdown, without duplicating that logic in a second place.

Alternative considered: writing both from the client in a transaction. Honest and
simpler to read, but it puts an invariant in the least reliable place.

### `security_invoker` on the view, and why the RPC is not `SECURITY DEFINER`

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

### Next.js 16, and reading the docs before writing code

The scaffold ships an `AGENTS.md` that says, bluntly, that this is not the Next.js in
my training data and to read `node_modules/next/dist/docs/` first. Two changes here
would have cost real debugging time:

- `middleware.ts` is now `proxy.ts`, with the exported function renamed to match, and
  the edge runtime is not supported there.
- Synchronous `cookies()` is gone. Every request API is async, so the Supabase server
  client factory has to be `async` and `await cookies()`.

Both land exactly on the Supabase session wiring, which is the first thing this app
needs. Reading first cost a few minutes; finding them by debugging would have
cost more.

## Hard parts / dead ends

### Row-level security locked out my own trigger

Repricing a car through the app failed:

```
new row violates row-level security policy for table "price_changes"
```

The design was deliberate. `price_changes` has RLS on and **no INSERT policy at all**,
so no client can forge price history. What I had not accounted for is that a trigger
function runs with the privileges of whoever fired the statement — so the rule that
locks out a forger locked out the legitimate writer too.

It stayed hidden because the seed script uses the service-role key, which bypasses RLS
entirely. Seeding worked perfectly. The bug surfaced only when a signed-in user did a
real write in the browser.

Fixed in `0002_trigger_can_write_history.sql` with privilege rather than policy: the
trigger is `SECURITY DEFINER`, so it alone can write history, and clients still have no
INSERT path. It does not widen access — the function writes `owner_id = NEW.owner_id`,
and a caller can only reach the trigger by updating a vehicle that
`vehicles_update_own` already permits, whose `WITH CHECK` also stops them reassigning
ownership.

Then I re-ran the full boundary proof, because changing a privilege boundary is exactly
when you re-run it. All ten checks still pass, including "nobody can hand-write price
history" — the one that would have caught it if `SECURITY DEFINER` had opened that door.

The lesson worth keeping: **a seed script running with elevated privileges hides this
entire class of bug.** Testing writes as an admin is not testing the security model.

### Screenshots that lied about the layout

While checking phone width, several screenshots came back completely blank and I spent a
few minutes convinced the mobile layout had collapsed. It had not — the preview pane was
not compositing frames, so it was returning empty images. Inspecting the DOM directly
settled it: ten rows present, opacity 1, correctly positioned, no horizontal page
overflow, and the 720px inventory table scrolling inside its 335px card as intended.

Worth recording because the wrong conclusion was one step away: *the layout is broken*,
followed by "fixing" a layout that was already correct. Measure before you fix.

### `LayoutProps` is generated, not imported

First typecheck failed with `Cannot find name 'LayoutProps'` in the generated layout.
Next 16 generates route type helpers rather than exporting them, so `npx next typegen`
has to run before `tsc --noEmit` passes on a fresh checkout. Worth knowing for CI and
for anyone running the repo from scratch — it is in the README's setup steps.

## How I verified it works

**The security boundary.** `npm run verify:rls` signs in as dealer A with nothing but
the anon key and tries ten ways to reach dealer B's data: by owner id, by exact primary
key, unfiltered, through the price history, through the ageing view, through the
summary RPC, by update, by insert-as-someone-else, by hand-writing history, and signed
out entirely. All ten come back empty or refused. Full output in
`docs/security-boundary.md`.

The view and the RPC are checked separately from the tables on purpose — they fail
independently, and a view that forgot `security_invoker` would leak every dealer's
totals while the tables underneath looked locked.

**The analytics.** Read the seeded fleet back through `vehicle_ageing` and checked the
arithmetic by hand: a car acquired 148 days ago at a 45 AED/day holding rate shows
6,660 AED of holding cost, and after 6,500 AED of markdowns its margin at today's
asking price is **−3,160 AED**. That car has eaten its own profit, which is exactly the
unit the dashboard exists to surface. The bucket counts from
`inventory_ageing_summary()` sum to 9, matching the 9 unsold vehicles — the sold car is
correctly excluded from the summary while remaining in the view.

**The trigger.** 10 `price_changes` rows exist after seeding, none written by hand. The
seed applies markdowns as ordinary updates, so the history was produced by the same
path the live app will use.

**The write path, as a real user in a browser.** Repriced the 148-day Lexus from 47,500
to 45,000 while signed in as dealer A. A fourth history row appeared with reason
`manual` and today's date; the asking price updated; margin at list recomputed from
−3,160 to −5,660 AED; total markdown from first listing moved to 9,000. Every derived
figure came back from Postgres, not from arithmetic in the browser. This is also the
test that found the trigger bug above — the seed could never have found it.

## Known limitations

- The holding rate is a single configurable AED/day figure per dealer. Real floor-plan
  cost varies by lender, vehicle value and tenor. Out of scope for the time-box, and
  the number is deliberately visible in settings rather than hidden in a formula.
- `margin_at_list_aed` ignores reconditioning, registration and transport costs, so it
  is optimistic in absolute terms. It is still directionally right, which is what the
  ageing comparison needs.
- Seeded VINs are synthetic and will not decode in the task-01 recall lookup.
- The boundary check covers the PostgREST surface only — see `docs/security-boundary.md`
  for what it does not cover.
- **No dark mode.** A second palette validated against a dark surface is real work, and
  one excellent theme beats two mediocre ones inside the time-box.
- **No realtime.** Two open tabs will not sync until revalidation. Deliberate: a pricing
  review is a thing you sit down and do, not a live feed.
- **Dealer settings have no UI.** The daily holding rate is seeded and editable in the
  database only.
- **Charts animate in on load.** Mid-animation the plot area looks empty, which reads as
  a broken chart for a moment. Shortening or removing the entry animation would fix it;
  left as is because the motion is worth more than the half-second.

## Time spent

Rough effort by phase, filled in at the end:

- Schema, RLS, ageing view and summary RPC, seed and verification scripts — 
- Next.js scaffold and Supabase session wiring — 
- Dashboard UI and charts — 
- Verification and docs — 

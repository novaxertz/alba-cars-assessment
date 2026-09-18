# Problem statements

Agreed and written down before any code. Each project is time-boxed to 2–4 hours, so
what is deliberately left out matters as much as what is in.

**The three form one system.** 02 holds the dealership's inventory and what it is
costing. 03 acts on that inventory nightly and writes back. 01 checks the same cars for
open safety recalls, loosely coupled so it still runs if 02 is down.

A note on why these problems and not the obvious ones: the first versions of 02 and 03
were a leads-and-vehicles CRM and a lead-enrichment pipeline. Both are fine exercises
and neither says anything specific. A used car is a depreciating asset with a daily
carrying cost, and that is the problem a dealer actually has — so the dashboard measures
what the stock is costing rather than who owns which contact.

---

## 02 — Inventory ageing & price decay (Supabase) · build first

**Problem.** A used car costs money every day it sits on the lot: floor-plan interest,
depreciation, space. Dealers know this in the abstract and still cannot answer the
weekly question — *which specific units are bleeding, and which should be discounted
or wholesaled now?* Stock lists show what is in the yard, not what it is costing.

**For whom.** The sales manager running the weekly pricing review.

**Why this problem.** It is the dealership's actual economics rather than a generic
CRM, and it makes the analytics substantial: days-on-lot, holding-cost burn and price-decay
curves are real SQL doing real work server-side, rather than a bar chart dressed up as analysis.

**Advanced features implemented:** auth, row-level security, and analytics computed
in the database rather than in the browser.

**Out of scope** (2–4h): no photo uploads, no realtime subscriptions, no true
floor-plan financing model (a single configurable daily holding rate stands in), no
market-price benchmarking against live listings, no multi-branch hierarchy.

### Entities

`profiles` — `id` (uuid, FK `auth.users`), `full_name`, `role`.

`vehicles` — `id`, `owner_id`, `vin`, `make`, `model`, `year`, `mileage_km`,
`acquired_at`, `acquisition_cost_aed` (integer, whole dirhams — no floats for money),
`list_price_aed` (integer, current asking price), `status`
(`available|reserved|sold`), `sold_at` (nullable), `sold_price_aed` (nullable).

`price_changes` — `id`, `vehicle_id` (FK → vehicles, cascade), `owner_id`,
`old_price_aed`, `new_price_aed`, `changed_at`, `reason`
(`manual|scheduled_markdown|automation`). Append-only event log; a vehicle's price
history is the decay curve.

Relationship: `price_changes.vehicle_id → vehicles.id`, one-to-many. Both owned via
`owner_id`.

### Server-computed analytics

A view `vehicle_ageing` (days on lot, holding cost to date, total markdown to date)
and an RPC `inventory_ageing_summary()` returning per-bucket aggregates. Both
security-invoker so RLS still applies — the aggregate must not become a hole in the
boundary, and that is a point worth making out loud.

### Charts

1. **Ageing buckets with capital tied up** — 0–30 / 31–60 / 61–90 / 90+ days, by
   count and by dirhams. Answers "where is my money stuck."
2. **Price decay** — list price over time for ageing units, against acquisition cost.
   Shows the markdown eating the margin.
3. (If clock allows) holding-cost burn per week.

### Security boundary proof

Two seeded users. Signed in as A, query B's vehicles and B's `price_changes` directly
against the API, and separately call the RPC — show all three return nothing. Actual
commands and output pasted into the docs, not a claim.

### A way in

One-command seed script with a realistic ageing spread + test credentials in the README.

---

## 01 — Recall Radar, on a Next.js BFF · build second

**Problem.** Before a used car is listed, somebody should check whether it carries an
**open safety recall**. An unrepaired recall is a liability to sell, a disclosure
problem, and — when buying a trade-in — a negotiation lever. Most small dealers check
this never, or one car at a time, on a slow government website.

**For whom.** Whoever prices and lists incoming stock.

**What it does.** Paste a VIN (or a batch from the lot): decoded specs, any open
recalls, and a plain-language summary of what each recall means for a buyer.

**Why this upstream.** Every decision below is defensible because NHTSA really behaves
this way, and the recall summaries really cost money:
- the summarising model call needs an API key that can never reach the browser → the
  BFF exists for a concrete reason, demonstrated rather than asserted
- vPIC is genuinely slow, and a lot-wide sweep is N VINs of fan-out → caching is
  mandatory, not decorative
- per-resource TTLs are a real trade-off with numbers attached: decoded specs for a
  VIN are immutable (cache indefinitely), recalls change rarely (hours), and model
  summaries are cached because **each miss costs tokens** — a stronger reason than speed
- NHTSA drops requests under load → retry with backoff handles a real failure
- upstream outage → serve last-known recall data with its age shown and labelled
  stale, because flagged-stale safety data beats a blank screen

**Relationship to 02.** Loosely coupled on purpose. 02 knows the VIN of every unit, so
it can hand VINs across, and the interesting question — *which ageing units also carry
open recalls* — becomes answerable. But 01 runs standalone and does not fail if 02 is
down.

**Deliberately not reached for:** Redis. Single instance, no cross-instance cache
requirement, so an in-memory LRU with per-resource TTLs is correct — and saying why is
worth more than adding a dependency. (I have also not run Redis in production, and am not going to pretend otherwise.)

**Advanced feature implemented:** a backend-for-frontend, described above.

**Known limitation, accepted up front:** NHTSA data is **US-market**. A GCC-spec car
may decode partially or not at all. Real problem for a Dubai dealer, documented as
such rather than hidden — and the app must degrade legibly when a VIN returns nothing.

**Motion.** Nothing here animates by itself, so any motion has to be designed rather
than inherited from the data: sweep progress, result transitions, chart entry. That is
a real cost of choosing a useful subject over a naturally moving one.

**Out of scope:** no accounts, no persistence beyond the cache, no recall *repair*
tracking, no non-US market data sources, no OCR of VIN plates.

## 03 — Nightly inventory markdown agent (n8n) · build last

**Problem.** The ageing report in 02 only helps if somebody opens it. The weekly
pricing review slips, aged units keep accruing cost, and by the time anyone looks the
markdown needed is bigger. The review should come to the manager, already reasoned.

**For whom.** The same sales manager — who now gets a briefing instead of a dashboard
they forgot to check.

**Shape.** Cron trigger → read aged inventory from 02's Supabase → Switch on severity
(30 / 60 / 90+ days) → LLM node drafts the markdown recommendation and rationale per
unit → write the recommendation back to Supabase → deliver a digest. Error handling on
the Supabase and LLM calls with a handled failure branch, not a silent swallow.

**Why this and not a lead-enrichment pipeline.** This one acts on a system built
earlier in the same submission, so the automation has real data to reason about
instead of a synthetic payload.

**Idempotency and retry.** A unique key of (vehicle, run date) means a re-run or a double fire writes
nothing new and sends no second digest; flaky calls retry with backoff. These are
a pattern I have implemented before by hand (guarding webhook replays with a unique
constraint on the event id), so the README explains *why* it matters rather than just
pointing at a node.

**Honesty note.** n8n is new to me. The build log records learning it in real time:
first run, what broke, what the docs said. No claim of prior fluency anywhere.

**Risk accepted:** 03 depends on 02 being up. If 02 breaks, 03's demo breaks with it.
Mitigation is a recorded run plus the exported JSON, so the workflow is reviewable even
if the database is down.

**Out of scope:** no CRM write-back, no multi-channel delivery, no self-hosted n8n,
no automatic price *application* — it recommends, a human approves.

# Nightly markdown review

An n8n workflow that reads the ageing inventory from
[`../02-dashboard`](../02-dashboard), checks each car for open safety recalls through
[`../01-web-app`](../01-web-app), and every morning posts a pricing review to Discord —
with one rule that matters: **a car with an open "do not drive" recall never gets a
markdown recommendation.** You do not discount a car you should not be retailing.

**Workflow:** [`nightly-markdown-review.json`](./nightly-markdown-review.json) ·
**Scoring logic, readable on its own:** [`scoring.js`](./scoring.js) ·
**Build log:** [BUILD_LOG.md](./BUILD_LOG.md)

---

## What it does and why it is useful

A used car costs money every day it sits. The dashboard in 02 measures that, but a
dashboard only helps if somebody opens it. Weekly pricing reviews slip, and by the time
anyone looks, the markdown needed is bigger.

This brings the review to the manager, already reasoned:

- 9 cars past 30 days on the lot
- 1 held back — a 2006 Ford Ranger with **four open "do not drive" recalls**
- 8 scored with a recommended price, a rationale, and the carrying cost so far
- Re-running it changes nothing

The recommendations are written back into the same database the dashboard reads, so each
dealer sees their own under row-level security.

---

## Node-by-node walkthrough

| # | Node | What it does |
|---|---|---|
| 1 | **Every night at 06:00** | Schedule trigger, Asia/Dubai. |
| 2 | **Run now (demo)** | Manual trigger, same path — so it can be demonstrated on request. |
| 3 | **Fetch aged inventory** | `GET /rest/v1/vehicle_ageing` filtered to `status=available` and `days_on_lot>=30`, newest first. Retries 3× with backoff. On failure, routes to the handled error branch. |
| 4 | **Check open recalls** | `GET /api/lookup?vin=…` against task 01, once per vehicle. **Allowed to fail**: a VIN that will not decode must not stop a pricing review, so failures fall through and are reported as *unknown*, never as *no recalls*. |
| 5 | **Merge recall data** | Combines inventory and recall responses by position. |
| 6 | **Score the markdown** | Code node. Buckets by age (watch / act / urgent), sets the cut (3 / 6 / 10%), **caps it at 4% for cars already under water**, rounds to the nearest 500 AED, counts `parkIt` recalls, and writes a plain-English rationale. |
| 7 | **Retail or repair first?** | Switch. `priority = blocked` (an open "do not drive" recall) goes one way; everything else goes to pricing. The two paths do genuinely different things. |
| 8 | **Compose the do-not-retail alert** | Formats the blocked cars, with the recall counts and the caveat that NHTSA reports by model, not by VIN. |
| 9 | **Post the do-not-retail alert** | Discord. |
| 10 | **Record recommendation** | `POST /rest/v1/markdown_recommendations?on_conflict=vehicle_id,run_date` with `Prefer: resolution=ignore-duplicates`. Retries 3× with backoff; failures route to the handled branch. |
| 11 | **Build the digest** | Counts what was written versus already recorded, groups by severity, and trims to Discord's 2,000-character limit at a line boundary. |
| 12 | **Post the digest** | Discord. |
| 13 | **Explain the failure** | The handled failure branch. Names the stage that broke, the error, and the next step. |
| 14 | **Post the failure alert** | Discord. |

### The requirements, and where each one lives

| Requirement | Where |
|---|---|
| Trigger | Schedule (nightly) plus manual |
| Real API call | Supabase REST, and task 01's API |
| Transformation | `Score the markdown` — bucketing, capping, rounding, rationale |
| Branching | `Retail or repair first?`, two genuinely different destinations |
| Deliberate error handling | Error outputs on both Supabase nodes → `Explain the failure` → Discord |
| Delivered, verifiable output | Two Discord messages per run |
| **Bonus — idempotency** | `UNIQUE (vehicle_id, run_date)` + `on_conflict`; a re-run writes nothing |
| **Bonus — retry/backoff** | 3 attempts with waits on every network node |
| **Bonus — merging 2+ sources** | Inventory (Supabase) + recalls (task 01) fused before scoring |

---

## Setup

### 1. Database

Run [`../02-dashboard/supabase/migrations/0003_markdown_recommendations.sql`](../02-dashboard/supabase/migrations/0003_markdown_recommendations.sql)
in the Supabase SQL editor. It creates the table **and the unique constraint the
idempotency depends on** — without that constraint the workflow will happily write
duplicates.

### 2. Credentials in n8n

**Credentials → New → Supabase API**

| Field | Value |
|---|---|
| Host | `https://YOUR-PROJECT-REF.supabase.co` |
| Service Role Secret | your Supabase `service_role` key |

**Use the service-role key, not the anon key.** With the anon key nothing errors — row
level security hides every row and PostgREST returns `200 []`, so the workflow reports
"no aged vehicles" every night and looks perfectly healthy while doing nothing.

*No credentials are stored in the workflow JSON — only the credential **type**. That is
why this file is safe to commit.*

### 3. Discord

Channel → **Edit Channel → Integrations → Webhooks → New Webhook → Copy URL**.

### 4. Import and wire up

1. New workflow → click the canvas → paste the contents of `nightly-markdown-review.json`
2. Replace `YOUR-PROJECT-REF` in the two Supabase node URLs with your project ref
3. Paste your Discord URL into the **three** post nodes
4. Open **Fetch aged inventory** and **Record recommendation**, select the Supabase
   credential in each, and **save**

> On import n8n pre-fills the credential dropdown with the only matching credential
> *without binding it*. It looks attached and is not. Select it explicitly and save, or
> the first run fails with `Credentials not found`. This cost me three runs.

### 5. Run it

**Execute workflow.** Then execute it again — that is the idempotency demonstration.

---

## How to verify it worked

**In Discord**, two messages on the first run:

1. *"Do not retail — open 'do not drive' recalls"* naming the 2006 Ford Ranger, its four
   recalls, its days on the lot, and an instruction not to list it.
2. *"Nightly markdown review"* — 9 vehicles past 30 days, 8 recommendations recorded,
   led by the 148-day Lexus, with a total proposed reduction and a note that nothing has
   been applied.

**On the second run**, the digest reports **0 new recommendations, 8 already recorded
today.**

**In the database:**

```sql
select days_on_lot, severity, current_price_aed, recommended_price_aed, run_date
from markdown_recommendations order by days_on_lot desc;
```

8 rows, 8 distinct vehicles, one `run_date` — no matter how many times you run it. The
Ranger is deliberately absent.

**In the dashboard**, each dealer sees only their own recommendations, because RLS
applies to the rows the automation wrote.

**To see the failure path**, remove the Supabase credential from a node and run it. A
Discord alert arrives naming the failing stage and the fix, instead of the run dying
quietly.

---

## Known limitations

- **n8n Cloud trial** — the live instance expires. This JSON and these notes are the
  durable artifact.
- **No LLM node.** The rationale is deterministic. With no model credential available, a
  stubbed AI node would have been decoration rather than a feature.
- **Recall data is model-level and US-market.** Most VINs on the demo lot are synthetic
  and do not decode, so their recall status reads as *unknown* — which is deliberately
  not the same as *clear*.
- **One run covers every dealer.** The recommendations carry `owner_id` so each dealer
  sees only their own, but the digest is not split per dealer.
- **The schedule has never fired on its own** — every run so far was manual. The cron
  expression is correct but unproven.
- **If Discord is down past three retries**, that run's digest is lost. The
  recommendations are still recorded, and the next run reports them as already recorded.

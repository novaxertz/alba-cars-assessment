# Nightly markdown review

An n8n workflow that reads the ageing inventory from
[`../02-dashboard`](../02-dashboard), checks each car for open safety recalls through
[`../01-web-app`](../01-web-app), and every morning posts a pricing review to Discord —
with one rule that matters: **a car with an open "do not drive" recall never gets a
markdown recommendation.** You do not discount a car you should not be retailing.

**Workflow:** [`nightly-markdown-review.json`](./nightly-markdown-review.json) ·
**Code nodes, readable outside the JSON:** [`scoring.js`](./scoring.js),
[`digest.js`](./digest.js), [`blocked-alert.js`](./blocked-alert.js) ·
**Build log:** [BUILD_LOG.md](./BUILD_LOG.md) ·
**Walkthrough:** [2-minute video](https://www.loom.com/share/fbc2d80f8b8c495f81cf17ace3a38e51)

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
| 11 | **Build the digest** | Counts what was written versus already recorded, groups by severity, and trims to Discord's 2,000-character limit at a line boundary. Passes the figures on as fields, not prose. |
| 12 | **Gemini** | The model, attached to the node below. |
| 13 | **Draft the manager brief** | One LLM call per run. Writes two sentences of framing from figures that were already computed — it never sees or produces a price. Allowed to fail. |
| 14 | **Assemble the message** | Puts the brief on top of the computed digest, or ships the digest unchanged if the brief is missing or implausible, recording why. |
| 15 | **Send the digest** | Calls the **Post to Discord** sub-workflow. |
| 16 | **Explain the failure** | The handled failure branch. Names the stage that broke, the error, and the next step. |
| 17 | **Send the failure alert** | Calls the same sub-workflow. |

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
| **Bonus — LLM node** | Gemini writes the manager's opening brief; every figure beneath it is computed in code |
| **Bonus — reusable sub-workflow** | `Post to Discord`, called from all three delivery paths |

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

### 3. Discord, and the sub-workflow

Channel → **Edit Channel → Integrations → Webhooks → New Webhook → Copy URL**.

Import [`post-to-discord.json`](./post-to-discord.json) as its own workflow, name it
**Post to Discord**, and paste the webhook URL into its single HTTP node.

**That node is the only place the webhook URL exists.** Before this sub-workflow, the
main workflow carried three copies of it — the digest, the failure alert and the
do-not-retail alert — which meant three places to update when it rotates and three
chances to miss one. The main workflow now contains no webhook URL at all.

### 4. Gemini (optional but wired)

**Credentials → New → Google Gemini(PaLM) API**, paste a key from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) — the free tier is
enough for one call per night.

Then open the **Gemini** node and set the model. Two things to know, both of which cost
me several runs:

> **Enter the bare model id, with no `models/` prefix** — for example `gemini-2.5-flash`,
> not `models/gemini-2.5-flash`. The node's own dropdown lists them *with* the prefix and
> the node adds it again, producing `models/models/…`, which Google answers with
> `The resource you are requesting could not be found`. Use the **Expression** toggle to
> type the bare id.
>
> **Model availability varies by key.** The dropdown lists what your account can reach,
> so treat it as the source of truth for *which* models exist — just strip the prefix
> before using one. Whatever this file names may not be available to you.

`maxOutputTokens` is set to 2000 rather than a tight 200, because the thinking-capable
models spend part of that budget on reasoning before writing anything.

### 5. Import and wire up

1. New workflow → click the canvas → paste the contents of `nightly-markdown-review.json`
2. Replace `YOUR-PROJECT-REF` in the two Supabase node URLs with your project ref
3. Select the Supabase credential on **Fetch aged inventory** and **Record recommendation**
4. Select the Gemini credential on the **Gemini** node
5. On each of the three **Send the…** nodes, pick the `Post to Discord` workflow and set
   the `content` input to `{{ $json.content }}`
6. **Save**

> Two things an exported workflow does not carry, both of which *look* configured after
> import: credentials, and the sub-workflow reference. n8n pre-fills the credential
> dropdown with the only matching credential without binding it, and the call nodes show
> the sub-workflow's cached *name* with no ID behind it. Select both explicitly and save,
> or the first run fails with `Credentials not found`. This cost me several runs.

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

## Sample from a successful run

Verbatim from Discord. **First run:**

```
Do not retail - open "do not drive" recalls

- 2006 Ford Ranger (1FTZR45E36PA12345)
  4 "do not drive" recall(s) open - 104 days on the lot - asking AED 24,000
  Get the recall closed before this is listed. No markdown recommended.

Recall data from NHTSA, by make/model/year. Confirm with the manufacturer whether
this specific car has already been repaired.
```

```
Nightly markdown review - 2026-09-18
8 vehicles past 30 days. 8 new recommendation(s) recorded, 0 already recorded today.

1 vehicle(s) held back for open "do not drive" recalls - posted separately.

Over 90 days (3)
- 2016 Lexus ES 350 (21100A) - 148d - AED 47,500 -> AED 45,500 (-AED 2,000)
- 2018 Chevrolet Malibu (D10022) - 134d - AED 33,000 -> AED 31,500 (-AED 1,500)
- 2018 Porsche 718 Cayman (L13322) - 121d - AED 219,000 -> AED 197,000 (-AED 22,000)

Watch list (5)
- 2017 Land Rover Range Rover (A50021) - 86d - AED 159,000 -> AED 149,500 (-AED 9,500)
- 2018 Hyundai Elantra (U11934) - 73d - AED 31,000 -> AED 29,000 (-AED 2,000)
- 2018 Ford F-150 (A22871) - 58d - AED 63,000 -> AED 61,000 (-AED 2,000)
- 2019 Mitsubishi Pajero (H00931) - 52d - AED 68,000 -> AED 66,000 (-AED 2,000)
- 2019 BMW 320i (T10093) - 44d - AED 69,500 -> AED 67,500 (-AED 2,000)

Total proposed reduction: AED 43,000. Nothing has been applied - these are
recommendations for a human to approve.
Recall status unavailable for 6 vehicle(s); treated as unknown, not clear.
```

**Second run, immediately after, nothing else changed — this is the idempotency proof:**

```
Nightly markdown review - 2026-09-18
8 vehicles past 30 days. 0 new recommendation(s) recorded, 8 already recorded today.
```

The rest of the message is identical. The database agrees: 8 rows, 8 distinct vehicles,
one `run_date`, and `created_at` unchanged across three runs.

**And the handled failure path, from a real failure** (the Supabase credential was not
attached after an import):

```
Nightly markdown review FAILED
Stage: Fetch aged inventory
Error: Credentials not found
Next: Attach the Supabase credential to the Supabase nodes, then run again.

No recommendations were recorded for this run. Re-running today is safe - the unique
constraint on (vehicle, run date) means a partial run cannot create duplicates.
```

That alert was not staged. It is what the workflow actually sent when it broke.

Three things worth noticing in that output:

1. **The Ranger is in the first message and absent from the second.** A car with four
   open "do not drive" recalls is not a pricing problem.
2. **"Recall status unavailable for 6 vehicle(s); treated as unknown, not clear."** Most
   demo VINs are synthetic and do not decode. The workflow says so rather than implying
   a clean bill of health.
3. **The Lexus is cut by 2,000 AED, not 4,750.** It is already under water, so the
   markdown is capped — cutting deeper on a car that cannot cover its cost only deepens
   the loss.

---

## Known limitations

- **n8n Cloud trial** — the live instance expires. This JSON and these notes are the
  durable artifact.
- **The LLM writes framing, never figures.** Every price, day count and total in the
  digest is computed in code. A language model paraphrasing prices is how you publish a
  number nobody can trace, and the per-vehicle rationale stays deterministic for the
  same reason.
- **The brief is optional by design.** If the call fails, returns nothing, or returns an
  essay where two sentences were asked for, the digest ships unchanged and the node
  output records why. A model outage must not stop a pricing review.
- **Recall data is model-level and US-market.** Most VINs on the demo lot are synthetic
  and do not decode, so their recall status reads as *unknown* — which is deliberately
  not the same as *clear*.
- **One run covers every dealer.** The recommendations carry `owner_id` so each dealer
  sees only their own, but the digest is not split per dealer.
- **The schedule has never fired on its own** — every run so far was manual. The cron
  expression is correct but unproven.
- **If Discord is down past three retries**, that run's digest is lost. The
  recommendations are still recorded, and the next run reports them as already recorded.

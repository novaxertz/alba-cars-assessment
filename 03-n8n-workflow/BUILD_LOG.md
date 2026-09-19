# Build Log: Nightly markdown review

## Goal & scope decision

The ageing report in `../02-dashboard` only helps if somebody opens it. Weekly pricing
reviews slip, aged cars keep accruing carrying cost, and by the time anyone looks the
markdown needed is larger. This brings the review to the manager instead, already
reasoned — and it acts on the same live data the dashboard shows.

**n8n is new to me.** I said so on the call, and this log records learning it in real
time rather than implying prior fluency. What is not new is the thinking underneath:
idempotency through a database constraint, handled failure paths, and treating missing
data as unknown rather than clear.

Out of scope: no CRM write-back, no multi-channel delivery, no self-hosted n8n, and no
automatic application of prices — it recommends, a human approves.

## Stack & tooling

- **n8n Cloud** (trial) — 14 nodes, exported as JSON, which is the durable deliverable.
  The trial expires; the JSON does not.
- **Supabase REST** via n8n's predefined Supabase credential.
- **Task 01's deployed API** as a second data source, so the pricing decision knows
  about open safety recalls.
- **Discord webhook** for delivery.

## Key decisions & trade-offs

### Idempotency belongs in the database, not the workflow

`markdown_recommendations` carries `UNIQUE (vehicle_id, run_date)`. A re-run, a double
fire of the schedule, or a manual execution on the same day is refused by Postgres. The
workflow does not have to remember anything or check anything first — it is made safe by
a constraint it cannot forget.

This is the same shape as guarding webhook replays by inserting the event id under a
unique constraint before doing any work, which is a pattern I have implemented by hand
before. Correctness comes from the constraint, not from the caller's diligence.

### `Prefer: resolution=ignore-duplicates` is not enough on its own

Tested before trusting it:

| Request | Result |
|---|---|
| First insert | `201` |
| Same-day repeat, plain | `409 duplicate key ... one_recommendation_per_vehicle_per_day` |
| Same-day repeat, `Prefer: resolution=ignore-duplicates` | **still `409`** |
| Same-day repeat, `+ ?on_conflict=vehicle_id,run_date` | `201`, empty array |

PostgREST infers the conflict target from the **primary key** unless the constraint is
named explicitly. Without `on_conflict`, every re-run would have thrown a 409 into the
error branch, and the "run it twice, nothing duplicates" demonstration would have shown
an error instead of a clean skip. The empty array it returns with `on_conflict` is
exactly what the digest counts as "already recorded today".

### The branches do different things, because otherwise branching is decoration

The first version had a four-way Switch on ageing severity where **every branch fed the
same node**. That is not branching, it is a diagram. It also caused a real bug: n8n runs
a node once per incoming connection that carries data, so three populated branches
produced three executions and three Discord messages per run.

The Switch now routes on a decision that changes what happens:

- **Do not retail** — a car with an open "do not drive" recall never reaches the
  markdown table. You do not discount a car you should not be selling; you get the
  recall closed. It gets its own immediate alert.
- **Price review** — everything else is scored and recorded.

### Missing recall data is never treated as clear

The recall lookup is allowed to fail — a VIN that will not decode must not stop a
pricing review. But a failure produces "recall status unavailable, not confirmed clear"
in the rationale, never silence. Six of nine cars on the demo lot report exactly that,
because their VINs are synthetic.

### Markdowns are capped for cars already under water

A car whose asking price no longer covers cost plus carry gets at most a 4% cut rather
than the 10% its age implies. Cutting deeper on a car that cannot cover its cost only
deepens the loss; the smallest move that might shift it is the right one.

## Hard parts / dead ends

### `apikey` alone returns 200 and an empty array

Supabase authenticates `apikey`-only requests as **anon**, so row-level security hides
every row — and PostgREST returns `200 []` rather than an error.

A workflow built that way would report "no aged vehicles" every night, post a cheerful
empty digest, and look perfectly healthy while doing nothing at all. Both headers are
required, which is why the nodes use n8n's Supabase credential type rather than a
generic header credential. It is in the node's notes on the canvas.

### Credentials are not carried in an exported workflow

Obvious in hindsight and the cause of three failed runs: importing the JSON creates
nodes with no credential attached, and n8n *pre-fills the dropdown with the only
matching credential* without actually binding it. It looks attached. It is not, until
you select it and save.

The upside is that this is exactly why the exported JSON is safe to commit — it contains
no secrets, only credential *types*.

### The run that succeeded while doing the wrong thing

The worst bug of the three, and the only one nothing in n8n flagged.

The scoring code read `v.recall.parkIt`. The Merge node actually hands over task 01's raw
API response, shaped `{vehicle, recalls[], analysis}` — so `v.recall` was `undefined`,
**every** car evaluated as "recall status unknown", and the do-not-retail branch never
fired once. The Ranger with four "do not drive" recalls was written into the markdown
table with a routine price cut.

n8n reported nine items in, nine items out, green ticks throughout, "Workflow executed
successfully".

Worse, **my offline simulation passed** — because I had hand-built the merged object in
the shape my code expected rather than the shape the workflow produces. I tested my
assumption, not the system.

It was caught by querying the recommendations table and noticing a car that should not
have been there. The scorer now accepts either shape and treats anything unrecognised as
unknown.

*An automation that runs perfectly and quietly does the wrong thing is more dangerous
than one that crashes.* The execution log is not evidence; the output store is.

### Three duplicated nodes became one sub-workflow

The workflow had three identical Discord post nodes — digest, failure alert,
do-not-retail — each carrying its own copy of the webhook URL. Three places to update
when it rotates, three chances to miss one.

`Post to Discord` is now a sub-workflow taking a single `content` field, called from all
three paths. The main workflow contains **no webhook URL at all**, which is a better
outcome than the bonus point that prompted it.

### An LLM call that succeeded and returned nothing

The first run with Gemini attached produced a perfect digest with no brief on top, no
error anywhere, and a green tick. The fallback did exactly what it was built to do, and
that is precisely what made it hard to notice.

Cause: `gemini-2.5-flash` is a **thinking model**, and its reasoning tokens come out of
the same `maxOutputTokens` budget I had capped at 200. The budget was spent before the
model wrote a visible word, so the call returned empty rather than failing. Raised to
2000.

I also had the model name wrong — `models/gemini-2.0-flash`, which the node flagged. The
dropdown queries the account, so the live list is the source of truth, and it proved the
credential worked before the workflow ever ran.

The fallback now records **why** it fell back in the node output — model errored, empty,
too short, too long — because "the brief just isn't there" is not something anyone can
debug from a Discord message.

## How I verified it works

- **First run:** 9 aged vehicles in, **8 recommendations written**, the Ranger correctly
  absent from the markdown table and alerted separately as do-not-retail.
- **Second run, nothing changed:** still **8 rows, 8 distinct vehicles, one run date**,
  and `created_at` on the newest row unchanged. The duplicate inserts were refused by
  the database, and the digest reported them as already recorded.
- **Handled failure:** with the Supabase credential missing, the run did not die
  silently — the error branch posted a Discord alert naming the failing stage and the
  fix. That alert is a real one, not staged.
- **Constraint behaviour** was tested directly against PostgREST before the workflow
  relied on it (table above).
- **Scoring logic** was run offline against live inventory before being put in a node —
  which caught the underwater-markdown cap working correctly, and missed the shape bug.

## Known limitations

- **n8n Cloud trial.** The live instance expires; the exported JSON and this document
  are what survive. Setup is documented for a fresh import.
- **The LLM only writes framing.** Every figure is computed in code; the model never
  sees or produces a price. The per-vehicle rationale stays deterministic.
- **The brief is best-effort.** Failure, empty output or an implausible length all fall
  back to the digest as-is, with the reason recorded in the node output.
- **Recall data is model-level and US-market**, inherited from task 01. Most VINs on the
  demo lot are synthetic and do not decode, so their recall status reads as unknown.
- **The workflow processes every dealer's inventory** in one run, since it uses the
  service role. Each recommendation carries its `owner_id`, so row-level security still
  shows each dealer only their own — but the digest is not per-dealer.
- **Component matching between the two datasets is approximate** — see task 01.
- **No retry on the Discord post beyond three attempts**; if Discord is down for longer,
  that run's digest is lost. The recommendations are still recorded.
- **The schedule has never fired on its own.** Every run so far was manual; the cron
  expression is correct but unproven in the wild.

## Time spent

Rough effort by phase, filled in at the end:

- Schema for the recommendations table and testing the constraint —
- Authoring the workflow and the scoring logic —
- Import, credentials, and the three debugging rounds —
- Verification and docs —

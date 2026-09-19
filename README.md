# ALBA CARS engineering assessment

Three projects. They are not three unrelated exercises — together they are a small
operating system for a used-car lot.

A used car is a depreciating asset with a daily carrying cost. **02** measures what the
stock is costing. **03** acts on that every night and writes its recommendations back.
**01** answers what is actually wrong with a car before it is bought or listed.

```
        02  Lot                        03  Nightly markdown review
        ───────────                    ──────────────────────────
        vehicles, price history  ──►   reads the aged inventory
        ageing + holding cost          scores a markdown for each
        RLS per dealer            ◄──  writes recommendations back
              │                              │
              │ VIN                          │ VIN
              ▼                              ▼
        01  Second Opinion  ◄────────────────┘
        ─────────────────
        NHTSA recalls + owner complaints
        "do not drive" recalls pull a car
        out of the pricing path entirely
```

| | Project | Live | Source | Video |
|---|---|---|---|---|
| 01 | **Second Opinion** — what owners report vs what was recalled | [alba-second-opinion.vercel.app](https://alba-second-opinion.vercel.app) | [`/01-web-app`](./01-web-app) | _pending_ |
| 02 | **Lot** — inventory ageing & price decay | [alba-lot-dashboard.vercel.app](https://alba-lot-dashboard.vercel.app) | [`/02-dashboard`](./02-dashboard) | _pending_ |
| 03 | **Nightly markdown review** — n8n agent | [workflow JSON](./03-n8n-workflow/nightly-markdown-review.json) + [setup](./03-n8n-workflow/README.md) | [`/03-n8n-workflow`](./03-n8n-workflow) | _pending_ |

Each folder stands on its own: `README.md`, `BUILD_LOG.md`, `.env.example`, and
instructions to run it from zero.

**No real secrets are committed anywhere.** Every project ships `.env.example` with
placeholders; real values live in untracked `.env.local` or in n8n's credential store.

---

## 02 — Lot · inventory ageing & price decay

**The problem.** A stock list shows what is in the yard. It does not show what the yard
is costing. This answers the weekly pricing-review question: which units are bleeding,
and which should be discounted or wholesaled now.

**Sign in and look around** — two dealers, separate inventory, neither able to read the
other's rows:

| Email | Password |
|---|---|
| `dealer.a@albademo.test` | `demo-gUlWfgnl4mi7fW` |
| `dealer.b@albademo.test` | `demo-MlwR1EIbOwcuex` |

The 148-day Lexus at the top of dealer A's list is the point: it has already eaten its
own profit in carrying cost.

Supabase · **auth + row-level security + analytics computed in Postgres + private photo storage** ·
[the boundary proof](./02-dashboard/docs/security-boundary.md) ·
[build log](./02-dashboard/BUILD_LOG.md)

---

## 01 — Second Opinion · what owners report vs what was recalled

**The problem.** A recall list tells you what a manufacturer was forced to admit. It does
not tell you what the car does in the hands of the people who own it. NHTSA publishes
both datasets and nobody puts them side by side — so the faults owners keep reporting
that were *never* recalled stay invisible, and those are the ones with no free remedy
and no paper trail.

**Try it with nothing configured** — no sign-up, no keys:
[`1FTZR45E36PA12345`](https://alba-second-opinion.vercel.app/?vin=1FTZR45E36PA12345), a
2006 Ford Ranger — four "do not drive" recalls, 271 owner complaints, 4 deaths, and
**35% of complaints against components with no recall campaign at all**.

Next.js route handlers as a backend-for-frontend · three NHTSA datasets fused
server-side · per-resource cache TTLs, request coalescing, retry with backoff, and
stale-but-labelled data when the upstream fails · [build log](./01-web-app/BUILD_LOG.md)

**It is careful about what it does not know:** NHTSA answers by make/model/year, so this
reports open campaigns for a model, never that a specific car is unrepaired.

---

## 03 — Nightly markdown review · the automation

**The problem.** The ageing report only helps if somebody opens it. Weekly pricing
reviews slip, and by the time anyone looks the markdown needed is bigger.

Every morning: read the aged inventory, check each car for open safety recalls, score a
markdown, record it, and post the review to Discord — with one rule that matters. **A
car with an open "do not drive" recall never gets a markdown.** You do not discount a
car you should not be retailing; you get the recall closed.

n8n · **idempotent** (a re-run writes nothing — the database refuses it) · retry with
backoff · merges two sources · handled failure branch ·
[sample output from a real run](./03-n8n-workflow/README.md#sample-from-a-successful-run) ·
[build log](./03-n8n-workflow/BUILD_LOG.md)

---

## Planning

[`PROBLEM_STATEMENTS.md`](./PROBLEM_STATEMENTS.md) — what each project is, who it is for,
and what was deliberately left out, agreed before any code was written. It also records
where the first plan was wrong and why it changed, because that reasoning is the more
useful half.

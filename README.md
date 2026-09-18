# ALBA CARS engineering assessment

Three projects. They are not three unrelated exercises — together they are a small
operating system for a used-car lot.

A used car is a depreciating asset with a daily carrying cost. **02** measures what the
stock is costing. **03** acts on that nightly and writes its recommendations back. **01**
checks the same cars for open safety recalls before they are listed.

| | Project | Live | Repo | Video |
|---|---|---|---|---|
| 01 | **Recall Radar** — VIN decode + open safety recalls, on a Next.js BFF | [alba-recall-radar.vercel.app](https://alba-recall-radar.vercel.app) | [`/01-web-app`](./01-web-app) | _pending_ |
| 02 | **Lot** — inventory ageing & price decay | [alba-lot-dashboard.vercel.app](https://alba-lot-dashboard.vercel.app) | [`/02-dashboard`](./02-dashboard) | _pending_ |
| 03 | **Markdown agent** — nightly ageing review | _pending_ | [`/03-n8n-workflow`](./03-n8n-workflow) | _pending_ |

Each folder stands on its own: `README.md`, `BUILD_LOG.md`, `.env.example`, and
instructions to run it from zero.

**No real secrets are committed anywhere.** Every project ships `.env.example` with
placeholders; real values live in untracked `.env.local`.

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

The 148-day Lexus at the top of dealer A's list is the whole point: it has already eaten
its own profit in carrying cost.

Supabase · auth + row-level security + analytics computed in Postgres ·
[the boundary proof](./02-dashboard/docs/security-boundary.md) ·
[build log](./02-dashboard/BUILD_LOG.md)

---

## 01 — Recall Radar · open safety recalls by VIN

**The problem.** Before a used car is listed, somebody should check whether it carries an
open safety recall. An unrepaired recall is a liability to sell and a lever when buying.

**Try it with nothing configured** — no sign-up, no keys:
[`1FTZR45E36PA12345`](https://alba-recall-radar.vercel.app/?vin=1FTZR45E36PA12345), a
2006 Ford Ranger with four "do not drive" recalls.

Next.js route handlers as a backend-for-frontend · two NHTSA APIs fused server-side ·
per-resource cache TTLs, request coalescing, retry with backoff, and stale-but-labelled
data when the upstream fails · [build log](./01-web-app/BUILD_LOG.md)

**It is careful about what it does not know:** NHTSA answers by make/model/year, so this
reports open campaigns for a model, never that a specific car is unrepaired.

---

## Planning

[`PROBLEM_STATEMENTS.md`](./PROBLEM_STATEMENTS.md) — what each project is, who it is for,
and what was deliberately left out, agreed before any code was written.

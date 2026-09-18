# Recall Radar

**Does this car have an open safety recall?**

Decode a VIN and check it against NHTSA's recall database before the car goes on the
forecourt. An unrepaired recall is a liability to sell, a disclosure problem, and a
negotiating lever when you are the one buying. Most small dealers check this never, or
one car at a time on a slow government website.

**Live:** https://alba-recall-radar.vercel.app ·
**Build log:** [BUILD_LOG.md](./BUILD_LOG.md)

No sign-up, no keys, nothing to configure — try `1FTZR45E36PA12345` (a 2006 Ford Ranger
with four "do not drive" recalls) or use the example buttons on the page.

---

## Read this first — what it cannot tell you

**NHTSA's recall API answers by make, model and year. Not by VIN.**

So this app reports *"a 2006 Ford Ranger has four open 'do not drive' campaigns"*. It
cannot tell you whether **this particular truck** has already had the repair done —
per-VIN completion status is not published, and only the manufacturer's own lookup has
it.

That distinction is the difference between useful and misleading, so it appears on the
verdict card, in the page footer and here. A tool that overstates what it knows about a
safety recall is worse than no tool.

**US-market data only.** A GCC-spec import may decode partially or not at all. For a
Dubai dealer that is a genuine constraint, not a footnote.

---

## Features

- **One-car lookup** — paste a VIN, get decoded specs plus every open recall campaign,
  most serious first.
- **Lot sweep** — paste the VIN column out of a stock list (up to 12) and see which cars
  are flagged. Each VIN resolves independently, so one typo does not fail the batch.
- **Severity that comes from the data** — NHTSA publishes `parkIt` ("do not drive") and
  `parkOutSide` ("fire risk, park away from buildings") flags. Those are ranked above
  ordinary campaigns, because they are the difference between a car you can sell today
  and one that should not be moved.
- **Shareable URLs** — `/?vin=1FTZR45E36PA12345` loads that result directly, so a
  lookup can be sent to a colleague.
- **Honest failure states** — a malformed VIN, a VIN NHTSA cannot decode, and NHTSA
  being down are three different screens with three different explanations. The
  undecodable case passes NHTSA's own error text through rather than inventing a reason.
- **Check-digit warnings** — a VIN whose ninth character does not calculate still gets
  decoded, but is flagged as possibly mistyped rather than silently trusted.

---

## Architecture

```
Browser ──► Next.js route handler (the BFF) ──┬──► vPIC        decode the VIN
             cache · coalesce · backoff        └──► Recalls API by make/model/year
```

The client never talks to NHTSA. Everything goes through `app/api/lookup/route.ts`.

### Where the client/server line sits, and why it is there

**The two APIs do not compose on their own.** vPIC decodes a VIN; the recalls API only
accepts make/model/year. So the decode must happen first, and its output feeds the
second call. They also live on different hosts and disagree about capitalisation — vPIC
returns `Results`, recalls returns `results`. The browser should not have to know any of
that.

**Fan-out, not latency.** Measured before designing: vPIC answers in ~0.6s and recalls
in 0.3–0.9s. **Neither is slow**, and an earlier draft of this README justified the
cache on upstream latency, which was simply wrong. What is true is that a sweep is *two*
calls per vehicle — twelve cars is twenty-four requests against a public `.gov` service
from a single click. Caching and coalescing exist for that.

**Per-resource TTLs, because the resources genuinely differ:**

| Resource | TTL | Why |
|---|---|---|
| Decoded VIN | 30 days | A VIN decodes the same way forever. It is immutable data. |
| Recall list | 6 hours | Campaigns are announced monthly at most. |

**Request coalescing.** Ten concurrent lookups of the same VIN produce one upstream
call, not ten. A sweep of a lot with repeated model-years leans on this heavily.

**Graceful degradation.** Expired cache entries are *retained*, not deleted. If NHTSA
fails and we hold stale data, the app answers with it and labels it — "NHTSA
unreachable — showing data from 4h ago". Clearly-labelled stale safety data beats a
blank screen. If there is no cached copy at all, that is a different screen which says
so plainly.

**Retry with backoff and jitter** on network failures, 5xx, 429 and 408 — the failures
that might succeed on a retry. A malformed VIN is *not* retried: it will be just as
malformed in 300ms, and retrying only adds load to a public service. `Retry-After` is
honoured when sent.

Being straight about this: **NHTSA publishes no rate limit and I never observed a 429.**
The backoff is defensive engineering for when the upstream misbehaves, not a response to
a limit I measured. I chose not to hammer a government API to manufacture evidence for
my own design.

**Why not Redis.** Single instance, no cross-instance cache requirement, so a
process-local map with TTLs is the right amount of machinery. The trade-off is stated in
`lib/cache.ts`: on a serverless platform each instance holds its own cache, so this
lowers fan-out rather than guaranteeing a global hit rate. I have also not run Redis in
production and would rather defend a deliberate choice than pad the stack.

### The advanced options this covers

- **Your own backend (the big bonus)** — everything above.
- **Multi-API data fusion** — two NHTSA APIs blended into one answer that neither gives
  alone: vPIC knows what the car is, the recalls API knows what is wrong with that kind
  of car, and only the combination answers "is this car safe to sell".
- **Shareable, URL-synced state** — the VIN lives in the query string.

---

## API quirks worth knowing

1. **HTTP 200 does not mean success.** vPIC returns `200 OK` when it cannot decode the
   VIN; the failure is in the body as `ErrorCode`. `0` is clean, `1` means the check
   digit does not calculate, `5,6,14` means it could not decode. Status-code-only
   handling would confidently display a car that does not exist.
2. **Recalls are model-level.** Covered above; it is the most important quirk here.
3. **Two hosts, two envelopes, two capitalisations.** `Results` vs `results`.
4. **Model-name matching is more forgiving than expected.** `bmw`/`328i` and
   `BMW`/`328I` both work, and multi-word models such as `land rover`/`range rover`
   resolve correctly. Verified against the live API rather than assumed.
5. **Displacement arrives at absurd precision** — `2.998832712` for a 3.0-litre engine.
   Rounded at the normalisation boundary.
6. **`parkIt` and `parkOutSide` arrive as booleans in some rows and strings in others**,
   so both forms are coerced.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

That is genuinely all — **no environment variables are required.** NHTSA needs no key.

```bash
cp .env.example .env.local   # only if you want plain-language summaries
```

| Variable | Required | Effect |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Turns on plain-language recall summaries. Used server-side only; never sent to the browser. |

**Without a key**, each recall shows NHTSA's own consequence text and the page says
summaries are off. That fallback is deliberate rather than a stub: it means this repo
can be cloned and run with no keys and no signup, which matters more to a reviewer than
the feature does.

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |

---

## How I tested this

Every case below was run against the live NHTSA APIs, not mocks.

| Case | Input | Result |
|---|---|---|
| Clean decode | `1HGCM82633A004352` | 2003 Honda Accord Coupe, `ErrorCode 0`, 24 campaigns |
| Severity ordering | `1FTZR45E36PA12345` | 12 campaigns, 4 `parkIt`; all four sort to the top and the verdict reads "4 'do not drive' recalls" |
| Cold vs cached | same VIN twice | **1,186ms** then **9ms** |
| Too short | `ABC123` | `400` — "A VIN is 17 characters. That one is 6." |
| Illegal characters | VIN containing `I` | `400` — VINs never contain I, O or Q |
| Undecodable | `ZZZZZZZZZZZZZZZZZ` | `422` carrying NHTSA's own error text (`1,7,11,400`) |
| Check-digit warning | `WBA8E9G59GNT10093` | decodes to a 2016 BMW 328i, flagged as possibly mistyped |
| Sweep, partial failure | 5 VINs, 1 invalid | 4 resolved, the bad one failed individually — "4 of 5 cars have open campaigns · 1 should not be driven" |
| Deployed BFF | production URL | returns the Ranger's 12 campaigns, 4 `parkIt` |

**Client JavaScript shipped:** ~175 KB gzipped across all chunks, with no chart library
and no component library. The page itself is statically prerendered; only the API route
is dynamic.

**Lighthouse: not measured.** Chrome is not installed on this machine and the anonymous
PageSpeed Insights quota was exhausted when I tried, so I am not going to quote a score
I did not take. Run it yourself here:
[pagespeed.web.dev](https://pagespeed.web.dev/analysis?url=https://alba-recall-radar.vercel.app).

**What I would add with more time:** an automated test suite around the upstream
normalisation (the `ErrorCode` branches and the boolean/string coercion are exactly the
logic that rots silently), and a recorded fixture set so the failure paths can be
exercised without depending on NHTSA being up.

---

## Known limitations

- **Recalls are model-level, not VIN-level.** The headline caveat.
- **US-market vehicles only.** A GCC-spec car may not decode.
- **The cache is per-instance.** On serverless, a cold instance starts empty and
  instances do not share entries.
- **Backoff is untested against a real 429**, because NHTSA never sent one. The retry
  path is exercised by timeouts and 5xx, not by an observed rate limit.
- **Plain-language summaries are off** without a model API key.
- **No automated tests.** Verified by hand, case by case, as recorded above. This is the
  first thing I would fix.
- **Lighthouse unmeasured**, for the reasons above.

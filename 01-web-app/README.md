# Second Opinion

**What the manufacturer admitted, and what owners actually report.**

A recall list tells you what a manufacturer has been forced to acknowledge. It does not
tell you what the car actually does in the hands of the people who own it. NHTSA
publishes both — recalls, and the complaints owners file — and nobody puts them side by
side.

Paste a VIN and you get three things no single page gives you:

1. **The open recall campaigns**, ranked by NHTSA's own severity flags.
2. **A fault history** — complaints per year, with the recall campaign years marked
   alongside them.
3. **The gap** — components owners keep reporting that no campaign has ever covered.
   For a 2006 Ford Ranger that is **35% of all complaints**: suspension, fuel system,
   electrical, speed control. No remedy, no free repair, no paper trail. That is the
   list you hand to a mechanic before you bid.

**Live:** https://alba-second-opinion.vercel.app ·
**Build log:** [BUILD_LOG.md](./BUILD_LOG.md)

No sign-up, no keys, nothing to configure — try `1FTZR45E36PA12345` (a 2006 Ford Ranger:
four "do not drive" recalls, 271 owner complaints, 4 deaths) or use the example buttons.

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

- **Fault history** — every complaint filed for that model year, charted per year, with
  recall campaign years marked beneath. The relationship is shown, not asserted.
- **What owners actually report** — complaints grouped by component and ranked by how
  many involved a crash, fire or injury, each marked with the campaigns covering it or
  flagged **"no recall covers this"**.
- **One-car lookup** — decoded specs plus every open recall campaign, most serious first.
- **Read what owners actually wrote** — click any component and the complaints behind
  that number open in a windowed, infinitely-scrolling reader, filterable to the ones
  that involved a crash, fire or injury. The filter is in the URL, so the filtered view
  is a link.
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
                                              ┌──► vPIC         decode the VIN
Browser ──► Next.js route handler (the BFF) ──┼──► Recalls API   what was acknowledged
             cache · coalesce · backoff       └──► Complaints    what owners report
                    │
                    └──► analysis: group, harm-weight, find the gap  →  a verdict per component
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
| Complaints | 12 hours | Filed continuously but slowly; a 271-row history does not change between two page views. |

**The analysis runs on the server.** The browser receives a computed finding per
component — counts, harm weighting, campaign coverage — not 271 raw complaint records to
group itself. That is the same principle as the database-side analytics in
`../02-dashboard`: send an answer, not a dataset.

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
- **Multi-API data fusion** — three NHTSA datasets producing a conclusion none of them
  contains. vPIC knows what the car is; the recalls API knows what the manufacturer
  admitted; the complaints API knows what owners experienced. Only cross-referencing
  them yields "35% of complaints concern components with no campaign behind them",
  which is the actual product.
- **Shareable, URL-synced state** — the VIN *and the complaint filters* live in the
  query string, so any view of this app is a link:
  [`?vin=1FTZR45E36PA12345&component=SUSPENSION&harm=1`](https://alba-second-opinion.vercel.app/?vin=1FTZR45E36PA12345&component=SUSPENSION&harm=1)
  opens directly on the suspension complaints for that Ranger that involved a crash, fire
  or injury — one record out of nineteen. Filters that only exist in React state cannot
  be sent to a colleague, which for a finding somebody needs to act on is the whole
  point.
- **A signature animation** — opening a car from the lot sweep makes the result unfold
  from the row you clicked, while the list fades out underneath it. It is FLIP: the
  row's rect is measured at click time, the difference against the panel's final rect is
  inverted with a transform, and played back to identity over 560ms on an expo-out curve
  so it moves fast and settles. A real measurement from a run:
  `translate3d(1px, 136px, 0) scale(0.92)` → `scale(0.985)` → identity.

  Two decisions worth knowing, both made after looking at it rather than reasoning about
  it:

  - **The whole panel travels, not just the heading.** The first version morphed only
    the `<h2>` — a shared-element transition on paper, invisible in practice, because
    30px of text moved while everything around it simply appeared.
  - **Top edges align, not centres.** A 66px row expanding into a 3,000px panel has its
    centre 1,591px away; matching centres produced a flight from off-screen. Matching
    tops makes the panel appear to unfold from where the row was. The distance is capped
    at a third of the viewport, beyond which movement stops reading as "this became
    that".

  Only `transform` and `opacity` animate, both of which the compositor owns, so no frame
  does layout work. Animating `top`/`left`/`width` to the same visual effect would lay
  out every frame and fall off 60fps on a long sweep. Disabled entirely under
  `prefers-reduced-motion`.
- **High-performance lists** — the complaint reader. A 2016 Ford Explorer has **2,448
  complaints**, about 2.4MB of JSON from NHTSA. The browser never sees it:

  | | |
  |---|---|
  | Page size over the wire | **21KB** for 30 rows, not 2.4MB |
  | Second page | **6ms** — sliced from the cache the analysis already filled, no upstream call |
  | Filtered query (component + harm only) | **5ms** |
  | Rows in the DOM | **8–12**, for 528 records in that component |
  | Prefetch | next page requested at two-thirds, so it lands before you reach it |

  Rows are a fixed height so the position of any row is arithmetic rather than
  measurement, and spacers above and below keep the scrollbar proportional to the whole
  set. The trade-off is stated in the component: summaries are clamped, not reflowed —
  variable heights would need a measurement cache, which is a lot of machinery for a
  reading list.

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
7. **The complaints endpoint returns HTTP 400 with a success body.** For a model year it
   holds nothing for, it answers:

   ```
   400  {"count":0,"message":"Results returned successfully","results":[]}
   ```

   A 2015 F-150 does exactly this — while the sibling recalls endpoint returns 14
   campaigns for the same make, model and year, and the 2016 F-150 returns 63 complaints
   normally. So this is a per-model-year data gap announced with the wrong status code.

   Combined with quirk 1, the same organisation returns **200 when it failed** on one
   endpoint and **400 when it succeeded** on another. Neither can be trusted on status
   alone; both are decided by inspecting the body.

   The app distinguishes *"no complaints on file"* from *"the complaints database has
   nothing for this model year"* and says **"fault history unavailable — not clean"**
   for the second. Reporting an empty fault history as a clean one would be the single
   most dangerous thing this app could do.
8. **The two datasets name components differently.** A complaint says `AIR BAGS`; a
   recall says `AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE`. Matching is therefore on
   shared significant words rather than equality — an exact match would report almost
   everything as "never recalled", which would be worse than useless.

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
| Complaint analysis | `1FTZR45E36PA12345` | 271 complaints, 16 involving harm, 4 deaths, 35% against components with no campaign |
| Analysis degradation | complaints call forced to fail | recalls still render; a line explains the fault history is missing |

**Client JavaScript shipped:** ~175 KB gzipped across all chunks, with no chart library
and no component library. The page itself is statically prerendered; only the API route
is dynamic.

**Lighthouse (PageSpeed Insights, mobile, emulated Moto G Power on slow 4G):**
performance **97**, accessibility **100**, best practices **100**, SEO **100**.
FCP 1.4 s, LCP 2.0 s, TBT 0 ms, CLS 0, Speed Index 4.1 s. Re-run it here:
[pagespeed.web.dev](https://pagespeed.web.dev/analysis?url=https://alba-second-opinion.vercel.app).

The three points the report still docks are framework-level, not app code: a
render-blocking stylesheet (~300 ms), Next's legacy-browser polyfill chunk (14 KB) and
unused JavaScript in the framework bundle (53 KB). Chasing them means fighting the
framework's own output, which is not where the remaining time belongs.

**What I would add with more time:** an automated test suite around the upstream
normalisation (the `ErrorCode` branches and the boolean/string coercion are exactly the
logic that rots silently), and a recorded fixture set so the failure paths can be
exercised without depending on NHTSA being up.

---

## A causal claim I built and then deleted

The first version of the analysis scored each recalled component as **"remedy held"** or
**"still reported"**, by comparing complaints before and after the campaign opened.

Tested against the Ranger it returned *172 before, 0 after* — which looks like a
triumphant result and is an artefact. A further airbag campaign opened in 2025, so
"after" was a window a few months wide. Anchoring to the *first* campaign instead
inverts the distortion, because complaints **spike when a recall is announced** —
publicity drives reporting, not new failures.

Neither anchor supports a causal claim, so the claim is gone. What is left is evidence:
complaints per year, campaign years marked alongside, and how much is still being
reported in the last three years. The reader draws the inference; the app does not
assert one it cannot defend.

The one verdict kept is **"no recall covers this"**, because that is a fact about the
two datasets rather than an inference about cause.

## Known limitations

- **Recalls are model-level, not VIN-level.** The headline caveat.
- **Component matching is fuzzy.** Shared-word matching between the two datasets will
  occasionally pair a complaint with a campaign that is not really about the same part,
  or miss one that is. The alternative — exact matching — fails far more often.
- **Complaint volume is not a defect rate.** 271 complaints on a common truck and 271 on
  a rare one mean very different things, and NHTSA publishes no production figures to
  normalise against. The app reports counts and says so rather than implying a rate.
- **`UNKNOWN OR OTHER` is a real NHTSA category** and appears as a finding. It is not
  very actionable, and it is kept rather than hidden because dropping it would quietly
  change the percentages.
- **US-market vehicles only.** A GCC-spec car may not decode.
- **The cache is per-instance.** On serverless, a cold instance starts empty and
  instances do not share entries.
- **Backoff is untested against a real 429**, because NHTSA never sent one. The retry
  path is exercised by timeouts and 5xx, not by an observed rate limit.
- **Plain-language summaries are off** without a model API key.
- **No automated tests.** Verified by hand, case by case, as recorded above. This is the
  first thing I would fix.
- **Lighthouse's remaining performance points are framework-level** (render-blocking
  CSS, polyfill chunk, unused framework JavaScript) and were left alone deliberately.

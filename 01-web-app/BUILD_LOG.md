# Build Log: Second Opinion

## Goal & scope decision

**The first version was a recall lookup, and it read as a wrapper.** Paste a VIN, see a
list — competent, and nothing the government's own site does not already do. It fetched,
normalised and displayed, but it never *computed* anything. That criticism was fair and
is the reason for the reframe below.

The product now is the **disagreement between two datasets**. NHTSA publishes what
manufacturers have been forced to admit (recalls) and what owners actually experienced
(complaints). Neither is interesting alone: the recall list is on every car site, and
271 raw complaints are unreadable. The gap between them is published nowhere, and it is
the part a buyer needs — components owners keep reporting that no campaign has ever
covered carry no remedy, no free repair and no paper trail.

For a 2006 Ford Ranger: 35% of 271 complaints, led by suspension with 19 reports, one of
which involved a crash.

Deliberately out of scope for the time-box: no accounts, no persistence beyond the
cache, no recall *repair* tracking, no non-US data sources, no OCR of VIN plates, and no
attempt to normalise complaint counts into a defect rate (NHTSA publishes no production
figures to divide by).

## Stack & tooling

- **Next.js 16 with route handlers as a backend-for-frontend.** The browser never talks
  to NHTSA directly.
- **No database.** Nothing here needs to be remembered between visits; the only state is
  a cache, and a cache belongs in memory.
- **No Redis.** Single instance, no cross-instance cache requirement, so a process-local
  map with per-entry TTLs is the right amount of machinery. I have also not run Redis in
  production and would rather explain a deliberate choice than pad a stack. The
  trade-off is stated in `lib/cache.ts`: on a serverless platform each instance holds
  its own cache, so this lowers fan-out rather than guaranteeing a global hit rate.
- **No chart library, no component library.** The UI is one screen and hand-built.

## Key decisions & trade-offs

*(appended as each decision was made)*

### Reframing from lookup to assessment

A wrapper displays what it fetched. A product answers something the source cannot. The
test I applied: **does the app compute anything?** The first version did not — it
normalised and displayed. The rebuild adds a genuine analysis step: group complaints by
component, weight them by whether anyone was hurt, match each component against the
campaigns that cover it, and compute what is left over.

For a 2006 Ford Ranger that produces a number that exists nowhere else: **35% of the 271
complaints concern components with no recall campaign behind them** — suspension (19
complaints, one involving a crash), fuel system, electrical, speed control.

Nothing from the first build was discarded. The BFF, per-resource TTLs, coalescing,
backoff and stale-on-failure all carry over; the fusion claim got stronger, going from
two datasets concatenated to three genuinely synthesised.

### The analysis runs on the server, not in the browser

The client receives a computed finding per component. It never receives 271 complaint
records to group itself. Same principle as the database-side analytics in `02` — send an
answer, not a dataset — and it is the reason the BFF earns its place twice over.

### A hand-built SVG chart instead of a chart library

The fault-history chart is one chart with a simple shape. Recharts would roughly double
the client bundle of an app whose entire argument is that the work happens on the
server, so the chart is ~80 lines of SVG. Bars animate with `scaleY` from the baseline —
a composited transform — rather than animating height, which would lay out every frame.
It ships with a legend, a direct label on the peak year, and the same figures as a
table for anyone who cannot use the chart.

### I measured the upstream before designing for it, and my assumptions were wrong

I had planned to justify the caching layer on NHTSA being slow and rate-limited. Before
writing any code I measured it:

| | |
|---|---|
| vPIC decode | ~0.6s |
| Recalls lookup | 0.3–0.9s |
| Published rate limit | none that I could find |
| 429 observed | never |

So "it's slow" was false and "it rate-limits" was unverified. The cache is still
correct, but it needed a reason I could defend:

- **Fan-out.** A lot sweep is *two* calls per vehicle — decode, then recalls. Ten cars
  is twenty requests against a public `.gov` service from one page view.
- **Genuinely different TTLs.** A decoded VIN is immutable: the same VIN decodes the same
  way forever, so it can be cached for thirty days. Recall campaigns change monthly at
  most, so six hours. Those are not the same number.
- **Coalescing.** Ten concurrent lookups of one VIN become one upstream call.

And the backoff is described in the docs as *defensive* — for when the upstream
misbehaves — rather than implying I had measured a limit. I also declined to hammer a
government API just to manufacture evidence for my own design.

### HTTP 200 is not success

vPIC answers `200 OK` even when it cannot decode the VIN; the failure is inside the body
as `ErrorCode`. `0` means clean, `1` means the check digit does not calculate, and codes
like `5,6,14` mean it could not decode at all.

Status-code-only error handling would have shown a confident, empty result for a car
that does not exist. So the upstream layer inspects the payload, and a VIN that decodes
without a make or model year raises `VinDecodeError`, which the route maps to `422` with
NHTSA's own explanation passed through to the user.

The check-digit case is treated as a *warning*, not a failure — NHTSA still decodes
those, and a mistyped VIN that decodes to a plausible car is worth flagging rather than
rejecting.

### Two APIs, two capitalisations

vPIC is on `vpic.nhtsa.dot.gov` and returns `Results`. Recalls are on `api.nhtsa.gov`
and return `results`. Same organisation, different host, different envelope, different
case. The recalls API also only accepts make/model/year, never a VIN — which is exactly
why the decode has to happen first and why fusing the two server-side is the point of
the BFF rather than a decoration on it.

### Severity comes from the data, not from me

NHTSA ships `parkIt` ("do not drive") and `parkOutSide` ("fire risk, park away from
buildings") flags. Those are far better than a list sorted by date: they are the
difference between a car you can sell today and one that should not be moved. The UI
ranks critical, then serious, then standard, and the verdict headline reports the
"do not drive" count first if there is one.

Every severity level carries an icon and a text label as well as a colour, so the
meaning never rests on hue alone.

### The wording is deliberately narrower than the feature

The single most important fact about this app is what it *cannot* tell you: NHTSA
answers by make/model/year, so it reports open campaigns for a model, not repair status
for a car. Every surface says so — the verdict card, the footer, the README — because a
tool that overstates what it knows about a safety recall is worse than no tool.

### Summaries are optional, so the repo runs with no keys at all

Plain-language summaries need a model API key, and there isn't one available. Rather
than stub the feature, it degrades: with `ANTHROPIC_API_KEY` set the call happens
server-side and the key never reaches the browser; without it the app shows NHTSA's own
consequence text and says so in the header and beside each notice.

The upside outweighs the feature: a reviewer can clone this and run it with no keys and
no signup.

## Hard parts / dead ends

### I built a causal verdict, tested it, and deleted it

The analysis originally scored each recalled component as **"remedy held"** or **"still
reported"**, comparing complaints before and after the campaign opened.

Against the Ranger it returned *172 before, 0 after*. That looks like a triumphant
result and it is an artefact: a further airbag campaign opened in 2025, so "after" was a
window a few months wide. Anchoring to the *first* campaign instead inverts the
distortion, because complaints **spike when a recall is announced** — publicity drives
reporting, not new failures.

Neither anchor supports the claim, so the claim is gone. What remains is evidence:
complaints per year, campaign years marked beside them, and how much is still reported
in the last three years. The reader draws the inference; the app does not assert one it
cannot defend.

The verdict I kept is **"no recall covers this"**, because that is a fact about the two
datasets rather than an inference about cause. This was the most interesting hour of the
build: the feature that looked best in a demo was the one that had to go.

### A 400 that means success, and the false clean bill of health it nearly caused

Checking a 2015 F-150 returned 14 recall campaigns and no fault history at all. The
analysis had failed silently and the page implied the complaint side was simply empty.

The cause:

```
GET /complaints/complaintsByVehicle?make=ford&model=f-150&modelYear=2015
400  {"count":0,"message":"Results returned successfully","results":[]}
```

**HTTP 400 with a body announcing success.** My backoff layer did the right thing by its
own rules — 400 is a client error, not retryable, so it threw — and the whole fault
history went with it.

I had initially assumed a model-name mismatch and was about to build fuzzy name
matching. Testing across years disproved it: the same `f-150` string returns 0
complaints for 2012–2015 and 63 for 2016. It is a per-model-year data gap, announced
with the wrong status code. Fuzzy matching would have been an elaborate fix for a bug
that did not exist.

So `fetchComplaints` now tolerates 400 specifically and decides on the body, and the app
distinguishes **"no complaints on file"** from **"the complaints database has nothing
for this model year"**. The second renders as *"fault history unavailable — not clean"*.

That distinction matters more than anything else in this build: reporting missing safety
data as a clean record is the most dangerous thing this app could do.

Worth noting alongside quirk one: the same organisation returns **200 when it failed**
on vPIC and **400 when it succeeded** on complaints. Status codes are decoration here;
the body is the truth.

### Component names do not match between the two datasets

A complaint says `AIR BAGS`. The recall covering it says
`AIR BAGS:FRONTAL:DRIVER SIDE:INFLATOR MODULE`. Exact matching reports almost everything
as "never recalled" — the headline finding becomes 100% and meaningless.

Matching is therefore on shared significant words, with a stop-list so that noise words
like `SYSTEM` do not join unrelated components. It is deliberately loose and it will
occasionally mismatch; that trade-off is stated in the README rather than hidden, and
the alternative fails far more often.

### vPIC's idea of an engine size

The decoder returns displacement as `2.998832712`. Nobody describes a car as having a
2.998832712-litre engine. Rounded to one decimal at the normalisation boundary, along
with horsepower, which arrives with similar spurious precision.

Small, but it is the kind of detail that makes a page look machine-generated.

## How I verified it works

*(appended as it happened)*

- **Clean VIN** — `1HGCM82633A004352` decodes to a 2003 Honda Accord Coupe with 24 open
  campaigns. `ErrorCode 0`, no check-digit warning.
- **Cache behaviour** — the same lookup cold took **1,186ms**; immediately repeated it
  took **9ms**. The response carries the cache age so the UI can label it.
- **Malformed input** — a 6-character VIN and a VIN containing `I` both return `400`
  with a specific message rather than a generic failure.
- **Undecodable but well-formed** — `ZZZZZZZZZZZZZZZZZ` returns `422` carrying NHTSA's
  own error text (`1,7,11,400` — check digit, unregistered manufacturer, invalid model
  year position, invalid characters).
- **Severity ordering** — `1FTZR45E36PA12345` (2006 Ford Ranger) returns 12 campaigns of
  which 4 are `parkIt`; all four sort above the other eight and the verdict reads
  "4 'do not drive' recalls".
- **Sweep with a partial failure** — five VINs, one deliberately invalid: the four good
  ones resolved and the bad one failed *individually* rather than failing the whole
  request. Result line read "4 of 5 cars have open campaigns · 1 should not be driven".
- **Deployed BFF** — the production URL returns the Ranger's 12 campaigns with 4
  `parkIt`, so caching and fusion work outside the dev server too.
- **Client JavaScript** — ~175 KB gzipped across all chunks, no chart or component
  library. The page is statically prerendered; only the API route is dynamic.
- **Lighthouse was not measured.** Chrome is not installed here and the anonymous
  PageSpeed Insights quota was exhausted when I tried. Rather than quote a number I did
  not take, the README links the PageSpeed run so it can be done in one click. Recorded
  as a known limitation, not quietly omitted.

## Known limitations

*(appended as they appeared)*

- **US-market data only.** A GCC-spec car may decode partially or not at all. This is a
  real limitation for a Dubai dealer and it is stated on the page itself, not just here.
- **Recalls are model-level, not VIN-level.** See above. This is the most important
  caveat in the project.
- **Plain-language summaries are off** without a model API key.
- **The cache is per-instance.** On a serverless platform, a cold instance starts empty
  and instances do not share entries.
- **Backoff is untested against a real 429**, because NHTSA never sent me one. The retry
  path is exercised by timeouts and 5xx handling, not by an observed rate limit.
- **No automated tests.** Every case was verified by hand and recorded above. The
  upstream normalisation — the `ErrorCode` branches and the boolean/string coercion on
  NHTSA's severity flags — is exactly the logic that rots silently, so a test suite
  around it is the first thing I would add.
- **Lighthouse unmeasured**, for the reasons above.
- **Component matching is fuzzy**, by necessity. See above.
- **Complaint volume is not a defect rate.** NHTSA publishes no production figures, so
  271 complaints on a common truck cannot be normalised against a rare one. The app
  reports counts and says so rather than implying a rate.
- **Some model years have no complaint data at all** — a 2015 F-150 returns none while
  the 2016 returns 63. The app reports this as unavailable rather than clean, but it
  cannot fill the gap.
- **`UNKNOWN OR OTHER` shows up as a finding.** It is a real NHTSA category and not very
  actionable. Kept rather than hidden, because dropping it would quietly change the
  percentages the app reports.

## Time spent

Rough effort by phase, filled in at the end:

- Measuring the upstream APIs and their quirks — 
- Cache, upstream layer and BFF route — 
- UI, states and motion — 
- Verification, docs and deploy — 

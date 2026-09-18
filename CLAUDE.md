# Working rules for this repo

Three projects built for the ALBA CARS engineering assessment, under a 2–4 hour
time-box each. Built with AI coding tools, spec-first: the problem statement and
schema are agreed and written down before any code, and the agent implements against
them. Reviewed for intent mismatch — code that runs but does not do what was asked.

## Rules

1. **Never commit real secrets.** Every project ships `.env.example` with placeholders
   only; real values live in untracked `.env.local`. Check the diff before every commit.
2. **Claims trace to things actually built.** Nothing in a README or build log says I
   have done something I have not. Where a tool is new to me, the build log says so and
   records the learning as it happened — n8n in `03-n8n-workflow` is exactly that case.
3. **Build logs are written while working**, not reconstructed afterwards. Each project
   keeps its own `BUILD_LOG.md`, appended during the work. "Known limitations" is a real
   section: the shortcut taken, the thing stubbed, the edge case left uncovered.
4. **Hold the time-box.** 2–4 hours per project. At the limit: stop, write down where it
   landed and what would come next, move on.
5. **Report honestly.** If something does not work, it is said plainly and goes in Known
   Limitations rather than being quietly dropped.

## Layout

```
/01-web-app          Recall Radar — VIN decode + open safety recalls, Next.js BFF
/02-dashboard        Inventory ageing & price decay — Supabase
/03-n8n-workflow     Nightly markdown agent — exported n8n JSON + setup notes
README.md            root: links every live URL and video
```

Each folder stands alone: `README.md`, `BUILD_LOG.md`, `.env.example`, run instructions.

Build order: **02 → 01 → 03.**

## Session log

One line per work session: date, project, hours, what landed.

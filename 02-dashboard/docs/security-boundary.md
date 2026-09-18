# Security boundary — how I checked it actually holds

Row-level security is easy to claim and easy to get subtly wrong. This is the check,
run as a script so it can be repeated: `npm run verify:rls`.

## What it does

It signs in as dealer A using the **anon key only** — exactly what a browser has — and
then tries ten ways to reach dealer B's data. The service-role key is used solely to
look up B's row ids beforehand, so the script knows what it is supposed to fail to read.

The three read paths are tested separately because they fail independently:

| Path | Protected by |
|---|---|
| `vehicles` / `price_changes` tables | their RLS policies |
| `vehicle_ageing` view | `WITH (security_invoker = true)` |
| `inventory_ageing_summary()` | running `SECURITY INVOKER` |

This distinction is the point. A plain Postgres view runs with its **creator's**
privileges, so an aggregate built over RLS-protected tables will happily return totals
covering every dealer's inventory while the tables underneath look perfectly locked.
The check on the RPC compares its total against dealer A's true unsold count: if the
view or function leaked, that number would come back too high rather than erroring.

## Result

```
dealer B owns 3 vehicles; dealer A owns 10
target row: VF1RFA00X54900211 (a26b3cdf-62a8-4b8e-bdf8-092c66c650f8)

PASS  A reads B's vehicles by owner_id — 0 rows
PASS  A reads B's vehicle by its exact id — 0 rows
PASS  A unfiltered select returns only A rows — 10 rows, expected 10
PASS  A reads B's price history — 0 rows
PASS  A reads B's rows through the ageing view — 0 rows
PASS  RPC totals cover only A inventory — RPC counted 9, A owns 9 unsold
PASS  A cannot update B's vehicle — 0 rows changed
PASS  A cannot insert a row owned by B — refused by policy
PASS  Nobody can hand-write price history — refused by policy
PASS  Signed-out reader sees nothing — 0 rows

boundary holds: all checks passed
```

## What is not covered

- The check runs against the deployed project with seeded data, not against every
  possible policy edge. A policy added later could regress it — which is why it is a
  script rather than a screenshot.
- It tests the PostgREST surface, which is what the browser can reach. It does not test
  direct database connections, which are protected by the database password instead.
- Storage buckets are not used by this project, so bucket access rules are untested.

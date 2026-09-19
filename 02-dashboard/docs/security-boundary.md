# Security boundary — how I checked it actually holds

Row-level security is easy to claim and easy to get subtly wrong. This is the check,
run as a script so it can be repeated: `npm run verify:rls`.

## What it does

It signs in as dealer A using the **anon key only** — exactly what a browser has — and
then tries eighteen ways to reach dealer B's data, across the database, the storage
bucket and the realtime socket. The service-role key is used solely to look up B's row
ids beforehand, so the script knows what it is supposed to fail to read.

The three database read paths are tested separately because they fail independently:

| Path | Protected by |
|---|---|
| `vehicles` / `price_changes` tables | their RLS policies |
| `vehicle_ageing` view | `WITH (security_invoker = true)` |
| `inventory_ageing_summary()` | running `SECURITY INVOKER` |

This distinction is the point. A plain Postgres view runs with its **creator's**
privileges, so an aggregate built over RLS-protected tables will happily return totals
covering every dealer's inventory while the tables underneath look perfectly locked.

**Storage** is checked the same way: B tries to download A's photo by exact path, list
A's folder and write into it, and the object's public URL is fetched with no credentials
at all.

**The socket is checked too**, because it is a second way out of the database and it
would be entirely possible to secure the API and leave this open. Note the shape of that
pair of checks: "B is not told about A's rows" is only evidence *if* "B is told about its
own rows" passes. When the subscription was misconfigured, the leak check passed while
the socket delivered nothing — a test that passes because the feature is broken is worse
than no test, so the negative one is now skipped unless the positive one holds.

## Result

```
dealer B owns 3 vehicles; dealer A owns 11
target row: LSGHD52H4FD10022 (19adb71b-18ca-41aa-9b8f-756ddcf2b758)

PASS  A reads B's vehicles by owner_id — 0 rows
PASS  A reads B's vehicle by its exact id — 0 rows
PASS  A unfiltered select returns only A rows — 11 rows, expected 11
PASS  A reads B's price history — 0 rows
PASS  A reads B's rows through the ageing view — 0 rows
PASS  RPC totals cover only A inventory — RPC counted 10, A owns 10 unsold
PASS  A cannot update B's vehicle — 0 rows changed
PASS  A cannot insert a row owned by B — refused by policy
PASS  Nobody can hand-write price history — refused by policy
PASS  Signed-out reader sees nothing — 0 rows

--- private bucket ---
PASS  A can upload into its own folder — uploaded
PASS  B cannot download A's photo by path — refused
PASS  B cannot list A's folder — 0 objects visible
PASS  B cannot upload into A's folder — refused by policy
PASS  The bucket is not publicly readable — public URL returned 400
PASS  A can read its own photo through a signed URL — signed URL returned 200

--- realtime ---
PASS  B is told about its own rows — received
PASS  B is NOT told about A's rows — nothing leaked

boundary holds: all checks passed
```

## What is not covered

- The check runs against the deployed project with seeded data, not against every
  possible policy edge. A policy added later could regress it — which is why it is a
  script rather than a screenshot.
- It tests the PostgREST, Storage and Realtime surfaces, which are what a browser can
  reach. It does not test direct database connections, which are protected by the
  database password instead.
- Signed URLs are bearer tokens for their lifetime: anyone who obtains one can read that
  object until it expires (an hour). That is the trade-off for serving private images
  without proxying every byte through the app.

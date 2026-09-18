/**
 * In-memory cache with per-entry TTL, request coalescing, and stale retention.
 *
 * Why not Redis: this is a single instance with no cross-instance cache requirement, so
 * a process-local map is the correct amount of machinery. Adding Redis would buy nothing
 * here except a dependency and a second thing to operate. (Being straight about it: I
 * have not run Redis in production either, and I would rather explain a deliberate
 * choice than pad a stack.)
 *
 * The trade-off this accepts, stated plainly: on a serverless platform each instance has
 * its own cache, so the hit rate depends on how requests are distributed, and a cold
 * instance starts empty. That is fine for this workload — it lowers fan-out against a
 * public API rather than guaranteeing a global hit rate.
 *
 * Three behaviours that matter:
 *
 * 1. **Coalescing.** Ten concurrent lookups of the same VIN produce one upstream call,
 *    not ten. A sweep of a lot with repeated model-years leans on this heavily.
 * 2. **Stale retention.** Expired entries are kept, not deleted, so when the upstream
 *    fails we can still answer with last-known data and say how old it is.
 * 3. **Bounded size.** Oldest entries are evicted past the cap, so a long-running
 *    instance cannot grow without limit.
 */

type Entry<T> = { value: T; storedAt: number; ttlMs: number };

export type Fresh<T> = { value: T; stale: false; ageMs: number };
export type Stale<T> = { value: T; stale: true; ageMs: number };
export type Result<T> = Fresh<T> | Stale<T>;

const MAX_ENTRIES = 500;

const store = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

function evictIfNeeded() {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/**
 * Returns cached data when fresh; otherwise fetches. If the fetch throws and a stale
 * entry exists, the stale entry is returned with its age rather than an error — a
 * recall list from four hours ago, clearly labelled, beats a blank screen.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<Result<T>> {
  const hit = store.get(key) as Entry<T> | undefined;
  const now = Date.now();

  if (hit && now - hit.storedAt < hit.ttlMs) {
    return { value: hit.value, stale: false, ageMs: now - hit.storedAt };
  }

  // Someone is already fetching this exact key — wait for them instead of duplicating.
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) {
    const value = await pending;
    return { value, stale: false, ageMs: 0 };
  }

  const promise = fetcher()
    .then((value) => {
      store.set(key, { value, storedAt: Date.now(), ttlMs });
      evictIfNeeded();
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);

  try {
    const value = await promise;
    return { value, stale: false, ageMs: 0 };
  } catch (error) {
    if (hit) {
      // Graceful degradation: expired but present. Say how old it is and let the UI
      // decide how loudly to warn.
      return { value: hit.value, stale: true, ageMs: Date.now() - hit.storedAt };
    }
    throw error;
  }
}

export const cacheStats = () => ({ entries: store.size, inFlight: inFlight.size });

/** Test and demo affordance: lets the walkthrough show a cold cache on demand. */
export const clearCache = () => {
  store.clear();
  inFlight.clear();
};

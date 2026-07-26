/**
 * Tiny in-process TTL cache for loader data that is expensive to fetch but
 * changes slowly (Shopify product catalog, Instagram media, trial status).
 * Same pattern as the revenue/trial caches in shopify-data.server.js: one
 * Map per process, best-effort, safe to lose on restart.
 *
 * Only successful results are cached — if `fn` throws, nothing is stored and
 * the error propagates to the caller.
 */

const _store = new Map(); // key -> { value, at, ttlMs }

// Drop expired entries occasionally so long-lived processes don't accumulate
// stale keys (e.g. uninstalled shops). Cheap: runs at most once a minute.
let _lastSweep = 0;
function sweep() {
  const now = Date.now();
  if (now - _lastSweep < 60 * 1000) return;
  _lastSweep = now;
  for (const [key, entry] of _store) {
    if (now - entry.at > entry.ttlMs) _store.delete(key);
  }
}

/**
 * Return the cached value for `key`, or run `fn` and cache its result.
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<any>} fn
 */
export async function cached(key, ttlMs, fn) {
  sweep();
  const entry = _store.get(key);
  if (entry && Date.now() - entry.at < entry.ttlMs) {
    return entry.value;
  }
  const value = await fn();
  _store.set(key, { value, at: Date.now(), ttlMs });
  return value;
}

/**
 * Remove every cache entry whose key starts with `prefix`. Call after
 * mutations that make cached data wrong (plan change, Instagram disconnect).
 * @param {string} prefix
 */
export function invalidateCached(prefix) {
  for (const key of _store.keys()) {
    if (key.startsWith(prefix)) _store.delete(key);
  }
}

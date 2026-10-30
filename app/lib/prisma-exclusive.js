/**
 * Prisma is only used for Shopify Session rows, and DATABASE_URL is the
 * Supavisor transaction pooler with connection_limit=1. Two overlapping
 * session upserts therefore wait on a pool of one and die at 10s. That is
 * what /admin did: a live lookup per store, each calling unauthenticated.admin().
 *
 * Queue every Prisma query so merchant auth, webhooks, and /admin share the
 * one connection instead of fighting it. Waiting on this queue does not
 * count as a pool timeout. GraphQL to Shopify happens after the session row
 * is loaded, so it does not hold the connection.
 */

let exclusive = Promise.resolve();
let depth = 0;

// A merchant page load waits here behind every background session lookup,
// which is invisible in Postgres stats (each query is under 0.1ms) and is the
// first suspect when the home page LCP is slow. Logged so it can be measured.
const SLOW_WAIT_MS = 250;

export function runExclusive(fn) {
  const queuedAt = Date.now();
  const ahead = depth;
  depth += 1;
  const timed = () => {
    const waited = Date.now() - queuedAt;
    if (waited >= SLOW_WAIT_MS) {
      console.warn(`[prisma-queue] waited ${waited}ms behind ${ahead} queries`);
    }
    return fn();
  };
  const run = exclusive.then(timed, timed);
  exclusive = run.then(
    () => {
      depth -= 1;
    },
    () => {
      depth -= 1;
    },
  );
  return run;
}

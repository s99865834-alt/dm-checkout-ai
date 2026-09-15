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

export function runExclusive(fn) {
  const run = exclusive.then(fn, fn);
  exclusive = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

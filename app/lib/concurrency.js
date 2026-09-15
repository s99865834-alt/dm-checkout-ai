/**
 * Run `fn` over `items` with at most `limit` in flight at once.
 * Results stay in input order. Rejections are captured like Promise.allSettled
 * so one failure cannot abort the rest.
 *
 * Used where an unbounded Promise.all would take down the process: Prisma's
 * session pool is one connection, and Shopify/Meta rate-limit per shop.
 */
export async function mapWithConcurrency(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const n = Math.max(1, Math.min(limit, list.length));
  const results = new Array(list.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const idx = next;
      next += 1;
      if (idx >= list.length) return;
      try {
        results[idx] = { status: "fulfilled", value: await fn(list[idx], idx) };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

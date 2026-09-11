/**
 * PostgREST returns at most this many rows per request and gives no indication
 * when it truncates. That silence caused three bugs in a row:
 *
 *   - /admin froze for days once links_sent passed 1,000 rows, counting the
 *     oldest 1,000 and dropping everything newer. Love By Luna read 196 while
 *     the true figure was 208, and a live test reply changed nothing on screen.
 *   - the merchant analytics page was a week from the same fate, with two
 *     shops at 860-870 messages.
 *   - the Pro analytics page had it too.
 *
 * All three are now aggregated in SQL. What remains are narrowly scoped reads
 * (one shop, one customer, a one-hour window) that cannot realistically reach
 * the cap. "Cannot realistically" is exactly the assumption that failed
 * before, so anywhere the consequence of truncation is silent data loss rather
 * than a visibly odd number, wrap the result in warnIfTruncated.
 *
 * Pure and dependency-free so it can be tested directly.
 */

export const POSTGREST_ROW_CAP = 1000;

/**
 * A result of exactly the cap is the tell-tale of truncation. It can also be a
 * genuine coincidence, which is why this warns rather than throws: a false
 * alarm costs one log line, a missed truncation costs correctness.
 *
 * @param {unknown} rows
 * @returns {boolean}
 */
export function looksTruncated(rows) {
  return Array.isArray(rows) && rows.length === POSTGREST_ROW_CAP;
}

/**
 * Log when a query looks truncated. `label` should say which read it was, so
 * the message points at the code that needs paging or an aggregate.
 *
 * @param {string} label
 * @param {unknown} rows
 * @param {{warn: Function}} [logger] - injectable for tests
 * @returns {boolean} whether it looked truncated
 */
export function warnIfTruncated(label, rows, logger = console) {
  if (!looksTruncated(rows)) return false;
  logger.warn(
    `[row-cap] ${label} returned exactly ${POSTGREST_ROW_CAP} rows, which is PostgREST's limit. ` +
      `It has probably been truncated silently. Aggregate this in SQL or page it explicitly.`
  );
  return true;
}

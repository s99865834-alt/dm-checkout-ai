/**
 * In-process scheduler for outbound DM queue + follow-up automation.
 *
 * Why in-process?
 *   - One less moving piece (no Railway dashboard cron, no external scheduler).
 *   - The DM queue uses claim_dm_queue_batch (FOR UPDATE SKIP LOCKED) so it is
 *     safe even if multiple app instances run their own scheduler — at most
 *     one instance will claim each row.
 *
 * The legacy /cron/dm-queue and /cron/followups HTTP endpoints still work and
 * can be used for manual triggering or by an external scheduler (set
 * DISABLE_SCHEDULER=true to keep them as the only path).
 */

import logger from "./logger.server";

const DM_QUEUE_INTERVAL_MS = 60 * 1000;          // every 1 minute
const FOLLOWUPS_INTERVAL_MS = 60 * 60 * 1000;    // every 1 hour
// Discount pools only need to keep ahead of demand, and each variant holds a
// buffer of five codes, so a quarter hour is plenty. A variant that outruns
// its buffer sends links without a discount until the next pass rather than
// making anyone wait.
const DISCOUNT_POOLS_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes
const STARTUP_DELAY_MS = 10 * 1000;              // wait 10s after boot

let started = false;

async function tickDmQueue() {
  try {
    const { processDmQueue } = await import("./queue.server");
    const result = await processDmQueue();
    if (result?.processed > 0 || result?.sent > 0 || result?.failed > 0) {
      logger.debug("[scheduler] dm-queue tick", result);
    }
  } catch (err) {
    console.error("[scheduler] dm-queue tick error:", err?.message || err);
  }
}

async function tickFollowups() {
  try {
    const { processFollowups } = await import("./followup.server");
    await processFollowups();
    logger.debug("[scheduler] followups tick complete");
  } catch (err) {
    console.error("[scheduler] followups tick error:", err?.message || err);
  }
}

async function tickDiscountPools() {
  try {
    const { runDiscountPoolMaintenance } = await import("./discount-pool.server");
    const result = await runDiscountPoolMaintenance();
    if (result?.created > 0 || result?.minted > 0 || result?.reaped > 0) {
      logger.debug("[scheduler] discount-pools tick", result);
    }
  } catch (err) {
    console.error("[scheduler] discount-pools tick error:", err?.message || err);
  }
}

/**
 * Start the in-process scheduler. Idempotent — calling twice is a no-op.
 * Returns false if scheduling is disabled by environment.
 */
export function startScheduler() {
  if (started) return true;

  if (process.env.DISABLE_SCHEDULER === "true") {
    logger.debug("[scheduler] disabled via DISABLE_SCHEDULER=true; skipping");
    return false;
  }

  started = true;

  logger.debug(
    `[scheduler] starting (dm-queue every ${DM_QUEUE_INTERVAL_MS / 1000}s, ` +
      `followups every ${FOLLOWUPS_INTERVAL_MS / 60000}min, ` +
      `discount-pools every ${DISCOUNT_POOLS_INTERVAL_MS / 60000}min)`
  );

  // Wait a beat after boot so DB / env / supabase clients are ready, then
  // immediately run a first pass and start the recurring intervals.
  setTimeout(() => {
    tickDmQueue();
    tickFollowups();
    tickDiscountPools();
    setInterval(tickDmQueue, DM_QUEUE_INTERVAL_MS);
    setInterval(tickFollowups, FOLLOWUPS_INTERVAL_MS);
    setInterval(tickDiscountPools, DISCOUNT_POOLS_INTERVAL_MS);
  }, STARTUP_DELAY_MS);

  return true;
}

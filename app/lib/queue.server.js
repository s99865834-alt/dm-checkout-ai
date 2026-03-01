import supabase from "./supabase.server";
import { getMetaAuthWithRefresh, getInstagramUserIdFromToken, metaGraphAPI, metaGraphAPIInstagram } from "./meta.server";
import { incCounter } from "./metrics.server";

const MAX_PER_MINUTE = 120;
const MAX_ATTEMPTS = 3;

/**
 * Atomically check and increment the per-shop sliding-window rate limit.
 * Uses a single DB RPC (INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING)
 * so the increment and check happen in one atomic operation — no read-then-update race.
 *
 * Returns true if the send is allowed (count was incremented and is within limit),
 * false if the limit is reached.
 */
export async function canSendForShop(shopId) {
  const now = new Date();
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), 0, 0)
  ).toISOString();

  const { data, error } = await supabase.rpc("increment_and_check_rate_limit", {
    p_shop_id: shopId,
    p_window_start: windowStart,
    p_max: MAX_PER_MINUTE,
  });

  if (error) {
    // Fallback: try the older RPC if the new one doesn't exist yet
    const { data: inc, error: incErr } = await supabase.rpc("increment_dm_rate_limit", {
      p_shop_id: shopId,
      p_window_start: windowStart,
    });
    if (incErr) {
      console.warn("[queue] canSendForShop: rate-limit DB error, allowing send:", incErr.message);
      return true;
    }
    return (inc ?? 1) <= MAX_PER_MINUTE;
  }

  return data === true;
}

// Periodically clean up old rate-limit rows (older than 2 minutes).
// Called opportunistically from processDmQueue so no separate cron is needed.
async function cleanOldRateLimitRows() {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  await supabase.from("dm_rate_limit").delete().lt("window_start", cutoff);
}

export async function sendDmNow(shopId, igUserId, text) {
  const metaAuth = await getMetaAuthWithRefresh(shopId);
  if (!metaAuth) {
    throw new Error("Instagram not connected for this shop");
  }

  const accessToken = metaAuth.ig_access_token || metaAuth.page_access_token;
  if (!accessToken) {
    throw new Error("No Instagram access token available");
  }

  // For Instagram Login, resolve account ID from token (GET /me) so we never use a wrong stored id (Code 100)
  let senderId = metaAuth.ig_business_id;
  if (metaAuth.auth_type === "instagram") {
    const idFromToken = await getInstagramUserIdFromToken(accessToken);
    if (idFromToken) {
      senderId = idFromToken;
    } else if (!senderId) {
      throw new Error("Instagram not connected for this shop");
    }
  } else if (!senderId) {
    throw new Error("Instagram not connected for this shop");
  }

  const endpoint = `/${senderId}/messages`;
  const messageData = {
    recipient: { id: String(igUserId) },
    message: { text: text },
  };

  const apiCall =
    metaAuth.auth_type === "instagram"
      ? () => metaGraphAPIInstagram(endpoint, accessToken, { method: "POST", body: messageData })
      : () => metaGraphAPI(endpoint, accessToken, { method: "POST", body: messageData });

  try {
    const response = await apiCall();
    return response;
  } catch (error) {
    if (error.message?.includes("Code: 190") || error.message?.includes("Session has expired")) {
      const { refreshMetaToken } = await import("./meta.server");
      await refreshMetaToken(shopId);
      const freshAuth = await getMetaAuthWithRefresh(shopId);
      const freshToken = freshAuth.ig_access_token || freshAuth.page_access_token;
      if (!freshToken) throw new Error("No Instagram access token available after refresh");
      let retryEndpoint = endpoint;
      if (freshAuth.auth_type === "instagram") {
        const idFromToken = await getInstagramUserIdFromToken(freshToken);
        if (idFromToken) retryEndpoint = `/${idFromToken}/messages`;
      }
      const retryCall = freshAuth.auth_type === "instagram"
        ? () => metaGraphAPIInstagram(retryEndpoint, freshToken, { method: "POST", body: messageData })
        : () => metaGraphAPI(retryEndpoint, freshToken, { method: "POST", body: messageData });
      return await retryCall();
    }

    throw error;
  }
}

function backoffMs(attempts) {
  const base = 30 * 1000;
  return base * Math.pow(2, Math.max(0, attempts - 1));
}

export async function processDmQueue() {
  // Opportunistically clean old rate-limit rows and reset stuck processing rows (fire-and-forget).
  cleanOldRateLimitRows().catch(() => {});
  resetStuckRows().catch(() => {});

  // Atomically claim a batch of pending rows. Only one process can claim each row
  // (FOR UPDATE SKIP LOCKED prevents duplicates across overlapping cron runs).
  let rows;
  const { data: claimedRows, error: claimErr } = await supabase.rpc("claim_dm_queue_batch", { p_limit: 200 });
  if (!claimErr && claimedRows) {
    rows = claimedRows;
  } else {
    // Fallback if RPC doesn't exist yet (pre-migration): use the old SELECT approach
    if (claimErr) console.warn("[queue] claim_dm_queue_batch RPC unavailable, using fallback:", claimErr.message);
    const { data, error } = await supabase
      .from("outbound_dm_queue")
      .select("id, shop_id, ig_user_id, text, status, attempts")
      .eq("status", "pending")
      .lte("not_before", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) {
      console.error("[queue] Error fetching outbound queue:", error);
      return { processed: 0, sent: 0, failed: 0 };
    }
    rows = data || [];
  }

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    processed += 1;

    const allowed = await canSendForShop(row.shop_id);
    if (!allowed) {
      const nextMinute = new Date(Date.now() + 60 * 1000).toISOString();
      await supabase
        .from("outbound_dm_queue")
        .update({ not_before: nextMinute, status: "pending", processing_since: null, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      continue;
    }

    try {
      await sendDmNow(row.shop_id, row.ig_user_id, row.text);

      await supabase
        .from("outbound_dm_queue")
        .update({ status: "sent", processing_since: null, updated_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);

      sent += 1;
    } catch (err) {
      const attempts = (row.attempts || 0) + 1;
      const shouldFail = attempts >= MAX_ATTEMPTS;
      const nextNotBefore = new Date(Date.now() + backoffMs(attempts)).toISOString();
      await supabase
        .from("outbound_dm_queue")
        .update({
          status: shouldFail ? "failed" : "pending",
          attempts,
          last_error: err?.message ?? String(err),
          not_before: shouldFail ? row.not_before : nextNotBefore,
          processing_since: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (shouldFail) failed += 1;
    }
  }

  incCounter("queue_processed", processed);
  incCounter("queue_sent", sent);
  incCounter("queue_failed", failed);

  return { processed, sent, failed };
}

/**
 * Reset rows stuck in "processing" for longer than 5 minutes.
 * Prevents permanent stuck rows if a worker crashes mid-send.
 */
async function resetStuckRows() {
  const { data, error } = await supabase.rpc("reset_stuck_processing_rows", { p_timeout_minutes: 5 });
  if (error) {
    // Fallback if RPC doesn't exist yet
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stuck } = await supabase
      .from("outbound_dm_queue")
      .update({ status: "pending", processing_since: null, updated_at: new Date().toISOString() })
      .eq("status", "processing")
      .lt("processing_since", cutoff)
      .select("id");
    if (stuck?.length) {
      console.log(`[queue] Reset ${stuck.length} stuck processing rows (fallback)`);
    }
    return;
  }
  if (data > 0) {
    console.log(`[queue] Reset ${data} stuck processing rows`);
  }
}

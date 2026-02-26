import supabase from "./supabase.server";
import { getMetaAuthWithRefresh, getInstagramUserIdFromToken, metaGraphAPI, metaGraphAPIInstagram } from "./meta.server";

const MAX_PER_MINUTE = 120;
const MAX_ATTEMPTS = 3;

/**
 * Check and increment the per-shop sliding-window rate limit using the shared
 * dm_rate_limit Supabase table. Safe across multiple Railway instances.
 *
 * Returns true if the send is allowed (and counts it), false if the limit is reached.
 */
export async function canSendForShop(shopId) {
  // Truncate to the current minute so all instances in the same minute share a row.
  const now = new Date();
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), 0, 0)
  ).toISOString();

  // Upsert: insert row with count=1, or increment if it already exists.
  // We check the resulting count to decide whether to allow the send.
  const { data, error } = await supabase
    .from("dm_rate_limit")
    .upsert(
      { shop_id: shopId, window_start: windowStart, count: 1 },
      { onConflict: "shop_id,window_start" }
    )
    .select("count")
    .single();

  if (error) {
    // If the upsert fails (e.g. race condition on first insert), fall back to increment.
    const { data: inc, error: incErr } = await supabase.rpc("increment_dm_rate_limit", {
      p_shop_id: shopId,
      p_window_start: windowStart,
    });
    if (incErr) {
      // On any DB error, allow the send so we don't silently drop messages.
      console.warn("[queue] canSendForShop: rate-limit DB error, allowing send:", incErr.message);
      return true;
    }
    return (inc ?? 1) <= MAX_PER_MINUTE;
  }

  // If the row was freshly inserted, count will be 1 (always allowed).
  // For an existing row the count was NOT incremented by the upsert above — we need to
  // do that ourselves via a second call only when we're within the limit.
  if (!data || data.count == null) return true;

  if (data.count < MAX_PER_MINUTE) {
    // Increment the existing row.
    await supabase
      .from("dm_rate_limit")
      .update({ count: data.count + 1 })
      .eq("shop_id", shopId)
      .eq("window_start", windowStart);
    return true;
  }

  // Limit reached — do not increment.
  return false;
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
  const now = new Date();

  // Opportunistically clean old rate-limit rows (fire-and-forget).
  cleanOldRateLimitRows().catch(() => {});

  const { data: rows, error } = await supabase
    .from("outbound_dm_queue")
    .select("id, shop_id, ig_user_id, text, status, attempts")
    .in("status", ["pending", "processing"])
    .lte("not_before", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[queue] Error fetching outbound queue:", error);
    return { processed: 0, sent: 0, failed: 0 };
  }

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const row of rows || []) {
    processed += 1;

    const allowed = await canSendForShop(row.shop_id);
    if (!allowed) {
      // Defer to the next minute window
      const nextMinute = new Date(Date.now() + 60 * 1000).toISOString();
      await supabase
        .from("outbound_dm_queue")
        .update({ not_before: nextMinute, status: "pending", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      continue;
    }

    try {
      await supabase
        .from("outbound_dm_queue")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", row.id);

      await sendDmNow(row.shop_id, row.ig_user_id, row.text);

      await supabase
        .from("outbound_dm_queue")
        .update({ status: "sent", updated_at: new Date().toISOString(), last_error: null })
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
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (shouldFail) failed += 1;
    }
  }

  return { processed, sent, failed };
}

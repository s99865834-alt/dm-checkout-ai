import supabase from "./supabase.server";
import { getMetaAuthWithRefresh, metaGraphAPI, metaGraphAPIInstagram } from "./meta.server";

const MAX_PER_MINUTE = 120;
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;

const rateBuckets = new Map();

function canSendForShop(shopId) {
  const now = Date.now();
  const bucket = rateBuckets.get(shopId) || [];
  const recent = bucket.filter((ts) => now - ts < WINDOW_MS);
  if (recent.length >= MAX_PER_MINUTE) {
    rateBuckets.set(shopId, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(shopId, recent);
  return true;
}

async function sendDmNow(shopId, igUserId, text) {
  const metaAuth = await getMetaAuthWithRefresh(shopId);
  if (!metaAuth || !metaAuth.ig_business_id) {
    throw new Error("Instagram not connected for this shop");
  }

  const accessToken = metaAuth.ig_access_token || metaAuth.page_access_token;
  if (!accessToken) {
    throw new Error("No Instagram access token available");
  }

  const endpoint = `/${metaAuth.ig_business_id}/messages`;
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
      const retryCall = freshAuth.auth_type === "instagram"
        ? () => metaGraphAPIInstagram(endpoint, freshToken, { method: "POST", body: messageData })
        : () => metaGraphAPI(endpoint, freshToken, { method: "POST", body: messageData });
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

    if (!canSendForShop(row.shop_id)) {
      const deferUntil = new Date(Date.now() + WINDOW_MS).toISOString();
      await supabase
        .from("outbound_dm_queue")
        .update({ not_before: deferUntil, status: "pending", updated_at: new Date().toISOString() })
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

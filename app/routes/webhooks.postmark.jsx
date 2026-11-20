import crypto from "node:crypto";
import supabase from "../lib/supabase.server";

// Bounce, spam complaint and subscription-change events from Postmark. Any of
// them stops the weekly email for that shop. Configured in Postmark as
// https://www.socialrepl.ai/webhooks/postmark?token=<POSTMARK_WEBHOOK_TOKEN>.

function tokenOk(request) {
  const expected = process.env.POSTMARK_WEBHOOK_TOKEN || "";
  const got = new URL(request.url).searchParams.get("token") || "";
  if (!expected || got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

function optOutReason(event) {
  if (event.RecordType === "SpamComplaint") return "spam_complaint";
  if (event.RecordType === "Bounce" && event.Type === "HardBounce") return "hard_bounce";
  if (event.RecordType === "SubscriptionChange" && event.SuppressSending === true) return "postmark_unsubscribe";
  return null;
}

async function shopIdFor(event) {
  if (event.Metadata?.shop_id) return event.Metadata.shop_id;
  if (!event.MessageID) return null;
  const { data } = await supabase
    .from("email_sends")
    .select("shop_id")
    .eq("provider_message_id", event.MessageID)
    .maybeSingle();
  return data?.shop_id || null;
}

export const action = async ({ request }) => {
  if (!tokenOk(request)) return new Response("Unauthorized", { status: 401 });
  const event = await request.json().catch(() => null);
  const reason = event ? optOutReason(event) : null;
  if (reason) {
    const shopId = await shopIdFor(event);
    if (shopId) {
      const { error } = await supabase.from("email_optouts").upsert({ shop_id: shopId, reason }, { onConflict: "shop_id" });
      if (error) console.error("[postmark] opt-out save failed:", error.message);
    }
  }
  return new Response("ok", { status: 200 });
};

export const loader = () => new Response("Method Not Allowed", { status: 405 });

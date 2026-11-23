import crypto from "node:crypto";
import supabase from "../lib/supabase.server";
import { subscriptionEffect } from "../lib/postmark-events";

// Bounce, spam complaint and subscription-change events from Postmark. Hard
// bounces, complaints and unsubscribes stop the weekly email for that shop; a
// re-subscribe from Postmark's confirmation page starts it again. Configured in
// Postmark as https://www.socialrepl.ai/webhooks/postmark?token=<POSTMARK_WEBHOOK_TOKEN>.

function tokenOk(request) {
  const expected = process.env.POSTMARK_WEBHOOK_TOKEN || "";
  const got = new URL(request.url).searchParams.get("token") || "";
  if (!expected || got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
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
  const effect = subscriptionEffect(event);
  if (effect) {
    const shopId = await shopIdFor(event);
    if (shopId) {
      const { error } =
        effect.action === "optout"
          ? await supabase.from("email_optouts").upsert({ shop_id: shopId, reason: effect.reason }, { onConflict: "shop_id" })
          : await supabase.from("email_optouts").delete().eq("shop_id", shopId).eq("reason", "postmark_unsubscribe");
      if (error) console.error("[postmark] opt-out update failed:", error.message);
    }
  }
  return new Response("ok", { status: 200 });
};

export const loader = () => new Response("Method Not Allowed", { status: 405 });

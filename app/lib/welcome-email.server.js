/**
 * Welcome email, sent once when a store installs (or reinstalls) the app.
 *
 * Goes out on Postmark's transactional stream: it is a one-to-one response to
 * the install, so it carries onboarding only, never plan or upgrade talk.
 * Off until WELCOME_EMAIL_ENABLED=true. Never throws into OAuth.
 */
import supabase from "./supabase.server";
import { isShopifyAutomatedReviewShop } from "./shopify-review-shop";
import { planWelcomeEmail } from "./welcome-email";
import { EMAIL_SITE_URL, buildEmailLinks, renderWelcomeEmail } from "./weekly-email-template";
import { postmarkConfigured, sendBatch } from "./postmark.server";
import logger from "./logger.server";

const TRANSACTIONAL_STREAM = () => process.env.POSTMARK_TRANSACTIONAL_STREAM || "outbound";

export function welcomeEmailEnabled() {
  return process.env.WELCOME_EMAIL_ENABLED === "true" && postmarkConfigured();
}

async function shopOwner(admin) {
  const response = await admin.graphql(`query WelcomeShopOwner { shop { email name } }`);
  const json = await response.json();
  const shop = json?.data?.shop || {};
  return { email: typeof shop.email === "string" ? shop.email.trim().toLowerCase() : null, name: shop.name || null };
}

export function buildWelcomeEmail({ shopDomain, storeName, reinstall = false }) {
  const links = buildEmailLinks({ shopDomain, appUrl: EMAIL_SITE_URL, unsubscribeUrl: null });
  const name = storeName || String(shopDomain).replace(/\.myshopify\.com$/, "");
  return renderWelcomeEmail({ facts: { storeName: name, shopDomain }, links, reinstall });
}

/**
 * @param {{admin: object, shopDomain: string, kind: "install"|"reinstall", isDevStore: boolean|null}} input
 */
export async function sendWelcomeEmail({ admin, shopDomain, kind, isDevStore }) {
  if (!welcomeEmailEnabled()) return { sent: false, reason: "Welcome email is not enabled" };
  try {
    const { data: shop } = await supabase.from("shops").select("id").eq("shopify_domain", shopDomain).maybeSingle();
    if (!shop) return { sent: false, reason: "Shop row missing" };
    const [owner, optRow, lastRow] = await Promise.all([
      shopOwner(admin),
      supabase.from("email_optouts").select("shop_id").eq("shop_id", shop.id).maybeSingle(),
      supabase.from("email_welcomes").select("sent_at, status").eq("shop_id", shop.id).maybeSingle(),
    ]);
    const decision = planWelcomeEmail({
      isDevStore,
      isReviewShop: isShopifyAutomatedReviewShop(shopDomain),
      optedOut: Boolean(optRow.data),
      email: owner.email,
      lastSentAt: lastRow.data?.status === "sent" ? lastRow.data.sent_at : null,
    });
    if (!decision.send) return { sent: false, reason: decision.reason };

    const email = buildWelcomeEmail({ shopDomain, storeName: owner.name, reinstall: kind === "reinstall" });
    await supabase
      .from("email_welcomes")
      .upsert({ shop_id: shop.id, sent_at: new Date().toISOString(), recipient: owner.email, status: "pending", error: null }, { onConflict: "shop_id" });
    const [result] = await sendBatch([
      {
        to: owner.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        stream: TRANSACTIONAL_STREAM(),
        metadata: { shop_id: shop.id, kind: "welcome" },
      },
    ]);
    await supabase
      .from("email_welcomes")
      .update(result.ok ? { status: "sent", provider_message_id: result.messageId } : { status: "failed", error: String(result.error).slice(0, 500) })
      .eq("shop_id", shop.id);
    if (!result.ok) console.error(`[welcome] send failed for ${shopDomain}:`, result.error);
    else logger.debug(`[welcome] sent to ${shopDomain}`);
    return { sent: result.ok, reason: result.ok ? null : result.error };
  } catch (err) {
    console.error(`[welcome] error for ${shopDomain}:`, err?.message || err);
    return { sent: false, reason: err?.message || String(err) };
  }
}

/** The welcome email for a sample store, sent to the founder's test inbox. */
export async function sendWelcomeTest() {
  if (!postmarkConfigured()) return { ok: false, error: "Postmark is not set up yet" };
  const to = process.env.EMAIL_TEST_TO || process.env.EMAIL_REPLY_TO;
  if (!to) return { ok: false, error: "Set EMAIL_TEST_TO to receive test emails" };
  const email = buildWelcomeEmail({ shopDomain: "your-store.myshopify.com", storeName: "Your Store" });
  const [result] = await sendBatch([
    { to, subject: `[Test] ${email.subject}`, html: email.html, text: email.text, stream: TRANSACTIONAL_STREAM(), metadata: { test: "true" } },
  ]);
  return result.ok ? { ok: true, to } : { ok: false, error: result.error };
}

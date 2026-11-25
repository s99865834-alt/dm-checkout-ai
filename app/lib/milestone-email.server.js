/**
 * "First 10 answered" email: finds stores that just crossed 10 answered
 * customer messages, decides with milestone-email.js, renders with
 * weekly-email-template.js, and sends once per store.
 *
 * Runs hourly from the scheduler. Sends only when the weekly email is on
 * (WEEKLY_EMAIL_ENABLED=true and Postmark set up); MILESTONE_EMAIL_ENABLED=false
 * turns this one off on its own. Same Postmark stream and unsubscribe
 * handling as the weekly email, and it honours the same opt-outs.
 */
import supabase from "./supabase.server";
import { getShopPlanAndUsage } from "./db.server";
import { isShopifyAutomatedReviewShop } from "./shopify-review-shop";
import { mapWithConcurrency } from "./concurrency";
import { ownerEmailFromContext } from "./weekly-email";
import { ordersBetween, totals, weeklyEmailEnabled } from "./weekly-email.server";
import {
  FIRST_ANSWERS,
  FIRST_ANSWERS_MILESTONE,
  MILESTONE_WINDOW_HOURS,
  nextStepFor,
  pickExamples,
  planMilestoneEmail,
} from "./milestone-email";
import { EMAIL_SITE_URL, buildEmailLinks, renderMilestoneEmail, replaceUnsubscribeLink } from "./weekly-email-template";
import { unsubscribeUrl } from "./email-unsubscribe.server";
import { postmarkConfigured, sendBatch } from "./postmark.server";
import { POSTMARK_UNSUBSCRIBE_PLACEHOLDER } from "./postmark-events";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const ownUnsubscribe = () => process.env.EMAIL_UNSUBSCRIBE_HANDLING === "custom";

export function milestoneEmailEnabled() {
  return weeklyEmailEnabled() && process.env.MILESTONE_EMAIL_ENABLED !== "false";
}

/** Shops that answered a customer in the window: the only ones that can have just crossed 10. */
async function recentlyAnsweringShopIds(since) {
  const { data, error } = await supabase
    .from("links_sent")
    .select("shop_id")
    .not("message_id", "is", null)
    .is("failed_reason", null)
    .gte("sent_at", since.toISOString())
    .limit(5000);
  if (error) throw new Error(`links_sent read failed: ${error.message}`);
  return [...new Set((data || []).map((r) => r.shop_id))];
}

/**
 * Newest answered messages since `since` with the reply that went out, and
 * whether that reply sent a product link, for quoting. Older replies are left
 * out so a reply from before a fix (a wrong price, say) is never showcased.
 */
async function answeredExchanges(shopId, since) {
  const { data: links } = await supabase
    .from("links_sent")
    .select("message_id, reply_text, product_id")
    .eq("shop_id", shopId)
    .not("message_id", "is", null)
    .is("failed_reason", null)
    .gte("sent_at", since.toISOString())
    .order("sent_at", { ascending: false })
    .limit(80);
  const byMessage = new Map();
  for (const link of links || []) {
    const entry = byMessage.get(link.message_id) || { reply_text: null, has_product_link: false };
    entry.reply_text = entry.reply_text || link.reply_text;
    entry.has_product_link = entry.has_product_link || Boolean(link.product_id);
    byMessage.set(link.message_id, entry);
  }
  const ids = [...byMessage.keys()];
  if (!ids.length) return [];
  const { data: messages } = await supabase.from("messages").select("id, text, ai_intent").in("id", ids);
  const byId = new Map((messages || []).map((m) => [m.id, m]));
  return ids
    .filter((id) => byId.has(id) && byMessage.get(id).reply_text)
    .map((id) => ({ ...byId.get(id), ...byMessage.get(id) }));
}

/** Everything planMilestoneEmail and the template need for one shop. */
export async function gatherMilestoneFacts(shop, now = new Date()) {
  const ctx = shop.store_context_json || {};
  const windowStart = new Date(now.getTime() - MILESTONE_WINDOW_HOURS * HOUR_MS);
  const [all, before, orders, optRow, sentRow, igRow, mapped, voiceRow, planUsage, exchanges, settingsRow] = await Promise.all([
    totals(shop.id, null, now),
    totals(shop.id, null, windowStart),
    ordersBetween(shop.id, null, now),
    supabase.from("email_optouts").select("shop_id").eq("shop_id", shop.id).maybeSingle(),
    supabase
      .from("email_milestones")
      .select("status")
      .eq("shop_id", shop.id)
      .eq("milestone", FIRST_ANSWERS_MILESTONE)
      .maybeSingle(),
    supabase.from("meta_auth").select("created_at").eq("shop_id", shop.id).maybeSingle(),
    supabase.from("post_product_map").select("id", { count: "exact", head: true }).eq("shop_id", shop.id),
    supabase.from("brand_voice").select("tone, custom_instruction").eq("shop_id", shop.id).maybeSingle(),
    getShopPlanAndUsage(shop.id),
    answeredExchanges(shop.id, windowStart),
    supabase.from("settings").select("dm_automation_enabled, comment_automation_enabled").eq("shop_id", shop.id).maybeSingle(),
  ]);
  const settings = settingsRow.data || {};
  const connectedAt = igRow.data?.created_at || shop.installed_at || shop.created_at;
  const voice = voiceRow.data || {};
  const facts = {
    shopId: shop.id,
    shopDomain: shop.shopify_domain,
    storeName: ctx.name || shop.shopify_domain.replace(/\.myshopify\.com$/, ""),
    email: ownerEmailFromContext(ctx),
    active: shop.active === true,
    isDevStore: shop.is_dev_store === true,
    isReviewShop: isShopifyAutomatedReviewShop(shop.shopify_domain),
    optedOut: Boolean(optRow.data),
    alreadySent: sentRow.data?.status === "sent",
    repliesOff: settings.dm_automation_enabled === false && settings.comment_automation_enabled === false,
    answered: Number(all.responded_messages) || 0,
    answeredBeforeWindow: Number(before.responded_messages) || 0,
    linksSent: Number(all.checkout_links_sent) || 0,
    opened: Number(all.unique_links_clicked) || 0,
    orders: orders.orders,
    revenue: orders.revenue,
    currency: orders.currency,
    daysConnected: Math.max(0, Math.floor((now.getTime() - new Date(connectedAt).getTime()) / DAY_MS)),
    examples: pickExamples(exchanges),
  };
  facts.nextStep = nextStepFor({
    mappedPosts: mapped.count || 0,
    canBrandVoice: planUsage.plan?.brandVoice === true,
    brandVoiceSet: Boolean((voice.custom_instruction || "").trim()) || (voice.tone && voice.tone !== "friendly"),
  });
  return facts;
}

function linksFor(shop, appUrl) {
  const unsubscribe = ownUnsubscribe() ? unsubscribeUrl(appUrl, shop.id) : POSTMARK_UNSUBSCRIBE_PLACEHOLDER;
  return unsubscribe ? buildEmailLinks({ shopDomain: shop.shopify_domain, appUrl, unsubscribeUrl: unsubscribe }) : null;
}

/**
 * This hour's decision and email for every shop that answered something in
 * the window. Writes nothing, so the admin preview can call it freely.
 */
export async function buildMilestoneEmails({ now = new Date(), appUrl = EMAIL_SITE_URL } = {}) {
  const ids = await recentlyAnsweringShopIds(new Date(now.getTime() - MILESTONE_WINDOW_HOURS * HOUR_MS));
  if (!ids.length) return [];
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, shopify_domain, active, is_dev_store, installed_at, created_at, store_context_json")
    .in("id", ids);
  if (error) throw new Error(`shops read failed: ${error.message}`);
  const results = await mapWithConcurrency(shops || [], 4, async (shop) => {
    const facts = await gatherMilestoneFacts(shop, now);
    const decision = planMilestoneEmail(facts);
    if (!decision.send) return { shop, facts, decision, email: null };
    const links = linksFor(shop, appUrl);
    if (!links) return { shop, facts, decision: { send: false, reason: "No unsubscribe secret configured" }, email: null };
    return { shop, facts, decision, links, email: renderMilestoneEmail({ facts, links }) };
  });
  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { shop: shops[i], facts: null, decision: { send: false, reason: `Error: ${r.reason?.message || r.reason}` }, email: null }
  );
}

/**
 * Claim the milestone for a shop. The (shop_id, milestone) key means one
 * process wins, so a restart or a second server never sends it twice. A row
 * left "failed" can be reclaimed.
 */
async function claimMilestone(item) {
  const row = { shop_id: item.shop.id, milestone: FIRST_ANSWERS_MILESTONE, recipient: item.facts.email, status: "pending" };
  const { error } = await supabase.from("email_milestones").insert(row);
  if (!error) return true;
  if (error.code !== "23505") throw new Error(`email_milestones claim failed: ${error.message}`);
  const { data: retried } = await supabase
    .from("email_milestones")
    .update({ ...row, error: null, sent_at: new Date().toISOString() })
    .eq("shop_id", item.shop.id)
    .eq("milestone", FIRST_ANSWERS_MILESTONE)
    .eq("status", "failed")
    .select("shop_id")
    .maybeSingle();
  return Boolean(retried);
}

/** Build, claim and send this hour's milestone emails. Returns counts. */
export async function sendMilestoneEmails({ now = new Date(), build = buildMilestoneEmails } = {}) {
  if (!milestoneEmailEnabled()) return { skipped: "Milestone email is not enabled" };
  const items = await build({ now });
  const claimed = [];
  for (const item of items) {
    if (!item.email || !item.facts?.email) continue;
    if (await claimMilestone(item)) claimed.push(item);
  }
  if (!claimed.length) return { sent: 0, failed: 0, considered: items.length };
  const results = await sendBatch(
    claimed.map((item) => ({
      to: item.facts.email,
      subject: item.email.subject,
      html: item.email.html,
      text: item.email.text,
      unsubscribeUrl: ownUnsubscribe() ? item.links.unsubscribe : undefined,
      metadata: { shop_id: item.shop.id, kind: FIRST_ANSWERS_MILESTONE },
    }))
  );
  let sent = 0;
  let failed = 0;
  await mapWithConcurrency(claimed, 4, async (item, i) => {
    const r = results[i];
    if (r?.ok) sent += 1;
    else failed += 1;
    await supabase
      .from("email_milestones")
      .update(
        r?.ok
          ? { status: "sent", provider_message_id: r.messageId, sent_at: new Date().toISOString() }
          : { status: "failed", error: String(r?.error || "unknown").slice(0, 500) }
      )
      .eq("shop_id", item.shop.id)
      .eq("milestone", FIRST_ANSWERS_MILESTONE);
  });
  return { sent, failed, considered: items.length };
}

const SAMPLE_FACTS = {
  storeName: "Your Store",
  shopDomain: "your-store.myshopify.com",
  answered: FIRST_ANSWERS + 2,
  linksSent: 9,
  opened: 4,
  orders: 1,
  revenue: 48,
  currency: "USD",
  daysConnected: 2,
  examples: [
    { question: "How much is the linen dress?", reply: "It's $48 and comes in S, M and L. Which size would you like?" },
    { question: "Do you ship to Canada?", reply: "Yes, we ship to Canada. Orders arrive in 5 to 8 business days." },
    { question: "Does the medium run small?", reply: "It runs true to size. If you're between sizes, most customers go up one." },
  ],
  nextStep: nextStepFor({ mappedPosts: 0 }),
};

/** A sample of this email for the admin preview. */
export function sampleMilestoneEmail() {
  const links = buildEmailLinks({
    shopDomain: SAMPLE_FACTS.shopDomain,
    appUrl: EMAIL_SITE_URL,
    unsubscribeUrl: `${EMAIL_SITE_URL}/email/unsubscribe?s=test&t=test`,
  });
  return renderMilestoneEmail({ facts: SAMPLE_FACTS, links });
}

/**
 * Send to the founder's test inbox, unlogged: one store's real email when
 * `shopId` is given, otherwise the sample.
 */
export async function sendMilestoneTest(shopId = null) {
  if (!postmarkConfigured()) return { ok: false, error: "Postmark is not set up yet" };
  const to = process.env.EMAIL_TEST_TO || process.env.EMAIL_REPLY_TO;
  if (!to) return { ok: false, error: "Set EMAIL_TEST_TO to receive test emails" };
  const testUnsubscribe = `${EMAIL_SITE_URL}/email/unsubscribe?s=test&t=test`;
  let email;
  if (shopId) {
    const item = (await buildMilestoneEmails()).find((i) => i.shop.id === shopId && i.email);
    if (!item) return { ok: false, error: "That store has no milestone email right now" };
    // Our signed link belongs to that merchant, so a click in a test copy would
    // unsubscribe them; Postmark's placeholder resolves per recipient instead.
    email = ownUnsubscribe() ? replaceUnsubscribeLink(item.email, item.links.unsubscribe, testUnsubscribe) : item.email;
  } else {
    email = replaceUnsubscribeLink(
      sampleMilestoneEmail(),
      testUnsubscribe,
      ownUnsubscribe() ? testUnsubscribe : POSTMARK_UNSUBSCRIBE_PLACEHOLDER
    );
  }
  const [result] = await sendBatch([
    { to, subject: `[Test] ${email.subject}`, html: email.html, text: email.text, metadata: { test: "true" } },
  ]);
  return result.ok ? { ok: true, to } : { ok: false, error: result.error };
}

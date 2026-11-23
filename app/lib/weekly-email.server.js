/**
 * Weekly merchant email: gathers each shop's facts, decides with
 * weekly-email.js, and renders with weekly-email-template.js.
 *
 * Reads only, apart from email_sends and email_optouts. Numbers come from the
 * same database function as the Analytics page, so the email and the page
 * never disagree.
 *
 * Environment:
 *   POSTMARK_SERVER_TOKEN, EMAIL_FROM  required to send at all
 *   WEEKLY_EMAIL_ENABLED=true          required for the weekly run; off means preview only
 *   EMAIL_REPLY_TO                     where merchant replies go
 *   EMAIL_TEST_TO                      inbox for "Send this to me" on /admin/emails
 *   POSTMARK_STREAM                    defaults to "broadcast"
 *   POSTMARK_WEBHOOK_TOKEN             secret in the Postmark webhook URL
 *   EMAIL_UNSUBSCRIBE_SECRET           optional; falls back to SHOPIFY_API_SECRET
 */
import supabase from "./supabase.server";
import {
  getShopPlanAndUsage,
  getSettings,
  getAttributionCount,
  getStoryMessageCount,
  getMissedCommentCount,
} from "./db.server";
import { getShopInsight } from "./insights.server";
import { isShopifyAutomatedReviewShop } from "./shopify-review-shop";
import { mapWithConcurrency } from "./concurrency";
import {
  normalizeStoreName,
  ownerEmailFromContext,
  parseReviewerNames,
  planWeeklyEmail,
  weekStartUtc,
} from "./weekly-email";
import { buildEmailLinks, renderWeeklyEmail, replaceUnsubscribeLink } from "./weekly-email-template";
import { unsubscribeUrl } from "./email-unsubscribe.server";
import { postmarkConfigured, sendBatch } from "./postmark.server";

const DAY_MS = 24 * 60 * 60 * 1000;
// Links and images in the email use the brand domain, which serves this app.
export const EMAIL_SITE_URL = process.env.EMAIL_SITE_URL || "https://www.socialrepl.ai";

const REVIEWS_URL = "https://apps.shopify.com/socialreplai/reviews";
const REVIEW_PAGES = 5;

/**
 * Store names that have reviewed the app. The in-app review prompt only
 * learns about reviews left through it, so a review written on the App Store
 * directly would otherwise get asked for again. Null when the page cannot be
 * read, which turns review asks off for that run.
 */
export async function getAppStoreReviewerNames() {
  const names = new Set();
  for (let page = 1; page <= REVIEW_PAGES; page += 1) {
    try {
      const res = await fetch(`${REVIEWS_URL}?page=${page}`, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; SocialReplAI/1.0; +https://www.socialrepl.ai)" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return page === 1 ? null : names;
      const found = parseReviewerNames(await res.text());
      // The listing has reviews, so an empty first page means the markup changed.
      if (found.size === 0) return page === 1 ? null : names;
      for (const name of found) names.add(name);
    } catch {
      return page === 1 ? null : names;
    }
  }
  return names;
}

async function totals(shopId, start, end) {
  const { data, error } = await supabase.rpc("shop_analytics_totals", {
    p_shop_id: shopId,
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_product_id: null,
  });
  if (error) throw new Error(`shop_analytics_totals failed: ${error.message}`);
  return (Array.isArray(data) ? data[0] : data) || {};
}

async function ordersBetween(shopId, start, end) {
  const { data, error } = await supabase
    .from("attribution")
    .select("amount, currency")
    .eq("shop_id", shopId)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  if (error) throw new Error(`attribution read failed: ${error.message}`);
  const rows = data || [];
  return {
    orders: rows.length,
    revenue: rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    currency: rows[0]?.currency || "USD",
  };
}

async function messagesSince(shopId, since) {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .gte("created_at", since.toISOString());
  if (error) throw new Error(`messages count failed: ${error.message}`);
  return count || 0;
}

/** Everything planWeeklyEmail and the template need for one shop. */
export async function gatherFacts(shop, now = new Date(), reviewerNames = null) {
  const ctx = shop.store_context_json || {};
  const storeName = ctx.name || shop.shopify_domain.replace(/\.myshopify\.com$/, "");
  const reviewed =
    shop.review_prompt_result === "already-reviewed" ||
    (reviewerNames ? reviewerNames.has(normalizeStoreName(storeName)) : null);
  const [igRow, optRow] = await Promise.all([
    supabase.from("meta_auth").select("id").eq("shop_id", shop.id).maybeSingle(),
    supabase.from("email_optouts").select("shop_id").eq("shop_id", shop.id).maybeSingle(),
  ]);
  const facts = {
    shopId: shop.id,
    shopDomain: shop.shopify_domain,
    storeName,
    email: ownerEmailFromContext(ctx),
    active: shop.active === true,
    isDevStore: shop.is_dev_store === true,
    isReviewShop: isShopifyAutomatedReviewShop(shop.shopify_domain),
    optedOut: Boolean(optRow.data),
    installedAt: shop.installed_at || shop.created_at,
    reviewed,
    igConnected: Boolean(igRow.data),
    week: { received: 0, responded: 0, linksSent: 0, clicks: 0, orders: 0, revenue: 0, currency: "USD" },
    last14Received: 0,
    last28Responded: 0,
    ordersAllTime: 0,
    storyThisMonth: 0,
    missedComments: 0,
    plan: null,
    usage: 0,
    cap: 0,
    insight: null,
    replyHoursOn: false,
  };
  if (!facts.igConnected) return facts;

  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const [week, month, orders, last14, ordersAllTime, story, missed, planUsage, settings] = await Promise.all([
    totals(shop.id, weekAgo, now),
    totals(shop.id, new Date(now.getTime() - 28 * DAY_MS), now),
    ordersBetween(shop.id, weekAgo, now),
    messagesSince(shop.id, new Date(now.getTime() - 14 * DAY_MS)),
    getAttributionCount(shop.id),
    getStoryMessageCount(shop.id),
    getMissedCommentCount(shop.id),
    getShopPlanAndUsage(shop.id),
    getSettings(shop.id),
  ]);
  facts.week = {
    received: Number(week.messages_received) || 0,
    responded: Number(week.responded_messages) || 0,
    linksSent: Number(week.checkout_links_sent) || 0,
    clicks: Number(week.clicks) || 0,
    ...orders,
  };
  facts.last14Received = last14;
  facts.last28Responded = Number(month.responded_messages) || 0;
  facts.ordersAllTime = ordersAllTime;
  facts.storyThisMonth = story;
  facts.missedComments = missed;
  facts.plan = planUsage.plan;
  facts.usage = planUsage.usage;
  facts.cap = planUsage.cap;
  facts.replyHoursOn = settings?.reply_schedule?.enabled === true;

  if (planUsage.plan?.insights) {
    const insight = await getShopInsight(shop.id);
    if (insight?.status === "ready") {
      facts.insight = {
        topics: (insight.data?.topics || []).map((t) => ({ label: t.label, count: t.count })),
        action: insight.data?.actions?.[0] || null,
      };
    }
  }
  return facts;
}

async function historyByShop(shopIds) {
  if (!shopIds.length) return new Map();
  const { data, error } = await supabase
    .from("email_sends")
    .select("shop_id, week_start, kind, extras, status")
    .in("shop_id", shopIds)
    .order("week_start", { ascending: false });
  if (error) throw new Error(`email_sends read failed: ${error.message}`);
  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.shop_id)) map.set(row.shop_id, []);
    map.get(row.shop_id).push(row);
  }
  return map;
}

/**
 * This week's decision and rendered email for every active shop. Writes
 * nothing, so it is safe to call from the admin preview as often as needed.
 */
export async function buildWeeklyEmails({ now = new Date(), appUrl = EMAIL_SITE_URL } = {}) {
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, shopify_domain, active, is_dev_store, installed_at, created_at, review_prompt_result, store_context_json")
    .eq("active", true);
  if (error) throw new Error(`shops read failed: ${error.message}`);

  const list = shops || [];
  const [history, reviewerNames] = await Promise.all([
    historyByShop(list.map((s) => s.id)),
    getAppStoreReviewerNames(),
  ]);
  const results = await mapWithConcurrency(list, 4, async (shop) => {
    const facts = await gatherFacts(shop, now, reviewerNames);
    const decision = planWeeklyEmail(facts, history.get(shop.id) || [], now);
    if (!decision.send) return { shop, facts, decision, email: null };
    const unsubscribe = unsubscribeUrl(appUrl, shop.id);
    if (!unsubscribe) return { shop, facts, decision: { send: false, reason: "No unsubscribe secret configured" }, email: null };
    const links = buildEmailLinks({ shopDomain: shop.shopify_domain, appUrl, unsubscribeUrl: unsubscribe });
    return { shop, facts, decision, links, email: renderWeeklyEmail({ decision, facts, links }) };
  });

  return {
    weekStart: weekStartUtc(now),
    items: results.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { shop: list[i], facts: null, decision: { send: false, reason: `Error: ${r.reason?.message || r.reason}` }, email: null }
    ),
  };
}

/** Sending is off until Postmark is set up and someone turns it on. */
export function weeklyEmailEnabled() {
  return process.env.WEEKLY_EMAIL_ENABLED === "true" && postmarkConfigured();
}

/**
 * Claim this week's row for a shop. The unique (shop_id, week_start) key means
 * only one process can win, so a restart or a second server never double-sends.
 * A row left "failed" by an earlier attempt can be reclaimed.
 */
async function claimSend(item, weekStart) {
  const row = {
    shop_id: item.shop.id,
    week_start: weekStart,
    kind: item.decision.kind,
    extras: item.decision.extras,
    recipient: item.facts.email,
    status: "pending",
  };
  const { data, error } = await supabase.from("email_sends").insert(row).select("id").single();
  if (!error) return data.id;
  if (error.code !== "23505") throw new Error(`email_sends claim failed: ${error.message}`);
  const { data: retried } = await supabase
    .from("email_sends")
    .update({ ...row, error: null })
    .eq("shop_id", item.shop.id)
    .eq("week_start", weekStart)
    .eq("status", "failed")
    .select("id")
    .maybeSingle();
  return retried?.id || null;
}

/** Build, claim, and send this week's emails. Returns counts. */
export async function sendWeeklyEmails({ now = new Date() } = {}) {
  if (!weeklyEmailEnabled()) return { skipped: "Weekly email is not enabled" };
  const { weekStart, items } = await buildWeeklyEmails({ now });
  const claimed = [];
  for (const item of items) {
    if (!item.email || !item.facts?.email) continue;
    const id = await claimSend(item, weekStart);
    if (id) claimed.push({ id, item });
  }
  const results = await sendBatch(
    claimed.map(({ item }) => ({
      to: item.facts.email,
      subject: item.email.subject,
      html: item.email.html,
      text: item.email.text,
      unsubscribeUrl: item.links.unsubscribe,
      metadata: { shop_id: item.shop.id, week_start: weekStart, kind: item.decision.kind },
    }))
  );
  let sent = 0;
  let failed = 0;
  await mapWithConcurrency(claimed, 4, async ({ id }, i) => {
    const r = results[i];
    if (r?.ok) sent += 1;
    else failed += 1;
    await supabase
      .from("email_sends")
      .update(
        r?.ok
          ? { status: "sent", provider_message_id: r.messageId, sent_at: new Date().toISOString() }
          : { status: "failed", error: String(r?.error || "unknown").slice(0, 500) }
      )
      .eq("id", id);
  });
  return { weekStart, sent, failed, skipped: items.length - claimed.length };
}

/** Send one shop's email to the founder's inbox, unlogged, for checking. */
export async function sendTestEmail(shopId) {
  if (!postmarkConfigured()) return { ok: false, error: "Postmark is not set up yet" };
  const to = process.env.EMAIL_TEST_TO || process.env.EMAIL_REPLY_TO;
  if (!to) return { ok: false, error: "Set EMAIL_TEST_TO to receive test emails" };
  const { items } = await buildWeeklyEmails();
  const item = items.find((i) => i.shop.id === shopId && i.email);
  if (!item) return { ok: false, error: "That store has no email this week" };
  // The rendered email carries that merchant's real unsubscribe link; clicking
  // it in a test copy would unsubscribe the merchant, not the tester.
  const email = replaceUnsubscribeLink(item.email, item.links.unsubscribe, `${EMAIL_SITE_URL}/email/unsubscribe?s=test&t=test`);
  const [result] = await sendBatch([
    { to, subject: `[Test] ${email.subject}`, html: email.html, text: email.text, metadata: { test: "true" } },
  ]);
  return result.ok ? { ok: true, to } : { ok: false, error: result.error };
}

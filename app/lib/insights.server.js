import supabase from "./supabase.server";
import logger from "./logger.server";
import { getShopPlanAndUsage } from "./db.server";
import { askInsightsJson } from "./ai.server";
import { getProductTitles } from "./shopify-data.server";
import { isShopifyAutomatedReviewShop } from "./shopify-review-shop";
import {
  INSIGHTS_MIN_MESSAGES,
  INSIGHTS_SAMPLE_SIZE,
  INSIGHTS_WINDOW_DAYS,
  buildInsightData,
  isInsightDue,
  productFlag,
  runInsightPipeline,
} from "./insights";

const DAY_MS = 24 * 60 * 60 * 1000;
const _running = new Set();

function titleFromHandle(handle) {
  if (!handle) return null;
  return handle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function resolveProductTitles(shop, products) {
  const ids = products.map((p) => p.product_id);
  const titles = await getProductTitles(shop.shopify_domain, ids).catch(() => new Map());
  const missing = ids.filter((id) => !titles.has(id));
  if (missing.length) {
    const { data } = await supabase
      .from("post_product_map")
      .select("product_id, product_handle")
      .eq("shop_id", shop.id)
      .in("product_id", missing);
    for (const row of data || []) {
      const title = titleFromHandle(row.product_handle);
      if (title && !titles.has(row.product_id)) titles.set(row.product_id, title);
    }
  }
  return products.map((p) => ({ ...p, title: titles.get(p.product_id) || "Unnamed product" }));
}

async function saveInsight(shopId, row) {
  const { error } = await supabase
    .from("shop_insights")
    .upsert({ shop_id: shopId, generated_at: new Date().toISOString(), ...row }, { onConflict: "shop_id" });
  if (error) throw new Error(`shop_insights upsert failed: ${error.message}`);
}

/**
 * Build and store a shop's insights for the last INSIGHTS_WINDOW_DAYS.
 * Writes only shop_insights.
 * @param {{id: string, shopify_domain: string, store_context_json?: object}} shop
 */
export async function generateShopInsights(shop) {
  if (_running.has(shop.id)) return { status: "running" };
  _running.add(shop.id);
  try {
    const end = new Date();
    const start = new Date(end.getTime() - INSIGHTS_WINDOW_DAYS * DAY_MS);
    const period = { period_start: start.toISOString(), period_end: end.toISOString() };

    const { data: stats, error } = await supabase.rpc("shop_insight_stats", {
      p_shop_id: shop.id,
      p_start: period.period_start,
      p_end: period.period_end,
    });
    if (error) throw new Error(`shop_insight_stats failed: ${error.message}`);

    const relevant = Number(stats?.relevant) || 0;
    if (relevant < INSIGHTS_MIN_MESSAGES) {
      await saveInsight(shop.id, {
        ...period,
        status: "not_enough",
        message_count: relevant,
        data: { relevant, needed: INSIGHTS_MIN_MESSAGES },
      });
      return { status: "not_enough" };
    }

    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("id, channel, text, ai_intent")
      .eq("shop_id", shop.id)
      .gte("created_at", period.period_start)
      .lte("created_at", period.period_end)
      .not("ai_intent", "is", null)
      .neq("ai_intent", "not_relevant")
      .not("text", "is", null)
      .order("created_at", { ascending: false })
      .limit(INSIGHTS_SAMPLE_SIZE);
    if (msgError) throw new Error(`messages fetch failed: ${msgError.message}`);
    const sample = (messages || []).filter((m) => m.text && m.text.trim());

    const products = (await resolveProductTitles(shop, stats?.products || [])).map((p) => ({
      ...p,
      flag: productFlag(p),
    }));

    const ctx = shop.store_context_json || {};
    const { topics, actions, aiFailed } = await runInsightPipeline({
      messages: sample,
      products: products.slice(0, 10),
      store: {
        name: ctx.name,
        hasShippingPolicy: Boolean(ctx.shippingPolicy),
        hasRefundPolicy: Boolean(ctx.refundPolicy),
      },
      ask: askInsightsJson,
    });

    await saveInsight(shop.id, {
      ...period,
      status: "ready",
      message_count: relevant,
      data: buildInsightData({
        stats,
        products,
        topics,
        actions,
        sampled: sample.length,
        aiFailed,
      }),
    });
    return { status: "ready", topics: topics.length };
  } finally {
    _running.delete(shop.id);
  }
}

export async function getShopInsight(shopId) {
  const { data, error } = await supabase
    .from("shop_insights")
    .select("status, period_start, period_end, generated_at, message_count, data")
    .eq("shop_id", shopId)
    .maybeSingle();
  if (error) {
    console.error("[insights] read failed:", error.message);
    return null;
  }
  return data;
}

/**
 * The stored insight plus the live text of every message it cites. Deleted
 * messages simply drop out, so counts can exceed the quotes shown.
 */
export async function getShopInsightForPage(shopId) {
  const insight = await getShopInsight(shopId);
  if (!insight || insight.status !== "ready") return { insight, messagesById: {} };
  const ids = [...new Set((insight.data?.topics || []).flatMap((t) => t.messageIds || []))];
  if (!ids.length) return { insight, messagesById: {} };
  const { data } = await supabase
    .from("messages")
    .select("id, text, from_username, channel, created_at")
    .eq("shop_id", shopId)
    .in("id", ids);
  const messagesById = {};
  for (const m of data || []) messagesById[m.id] = m;
  return { insight, messagesById };
}

/**
 * Scheduler pass: refresh insights for shops that have the capability and
 * whose last run is a week old. A few shops per pass keeps AI calls spread out.
 */
export async function runInsightsTick({ limit = 3 } = {}) {
  const nowIso = new Date().toISOString();
  const { data: shops, error } = await supabase
    .from("shops")
    .select("id, shopify_domain, store_context_json")
    .eq("active", true)
    .or(`plan.eq.PRO,beta_trial_expires_at.gt.${nowIso}`);
  if (error) throw new Error(`insights shop list failed: ${error.message}`);

  const candidates = (shops || []).filter((s) => !isShopifyAutomatedReviewShop(s.shopify_domain));
  if (!candidates.length) return { generated: 0 };

  const { data: rows } = await supabase
    .from("shop_insights")
    .select("shop_id, generated_at")
    .in("shop_id", candidates.map((s) => s.id));
  const lastRun = new Map((rows || []).map((r) => [r.shop_id, r]));

  let generated = 0;
  for (const shop of candidates) {
    if (generated >= limit) break;
    if (!isInsightDue(lastRun.get(shop.id))) continue;
    const plan = await getShopPlanAndUsage(shop.id).then((u) => u?.plan).catch(() => null);
    if (plan?.insights !== true) continue;
    try {
      await generateShopInsights(shop);
      generated += 1;
    } catch (err) {
      console.error(`[insights] ${shop.shopify_domain} failed:`, err?.message || err);
    }
  }
  if (generated) logger.debug(`[insights] refreshed ${generated} shops`);
  return { generated };
}

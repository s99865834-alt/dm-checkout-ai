/**
 * Are the links we send still opening something real?
 *
 * Two halves:
 *  - getLinkProblems: which of a merchant's mapped posts (and their default
 *    product) point at a product that is deleted, unpublished, or sold out,
 *    shown on the home page so they can remap it.
 *  - runSentLinkCheck: a recurring pass over links sent in the last day,
 *    logging any that no longer open to error_logs as "broken_link", which
 *    /admin lists. Read-only toward merchant state: it only ever inserts logs.
 */

import supabase from "./supabase.server";
import logger from "./logger.server";
import { getProductLinkNodes } from "./shopify-data.server";
import { productLinkStatus, mappingProblemText } from "./product-link-status";

export const BROKEN_LINK_ERROR_TYPE = "broken_link";

const numericId = (id) => String(id ?? "").match(/(\d+)$/)?.[1] || "";

/**
 * @param {string} shopDomain
 * @param {{ mappings?: object[], settings?: object|null, admin?: object|null }} opts
 * @returns {Promise<{ posts: Record<string, {productId: string, variantId: string|null, text: string}>, defaultProduct: {productId: string, variantId: string|null, text: string}|null } | null>}
 *   null when the products could not be checked
 */
export async function getLinkProblems(shopDomain, { mappings = [], settings = null, admin = null } = {}) {
  const defaultId = settings?.featured_product_id || null;
  const ids = mappings.map((m) => m.product_id).filter(Boolean);
  if (defaultId) ids.push(defaultId);
  if (ids.length === 0) return { posts: {}, defaultProduct: null };

  const nodes = await getProductLinkNodes(shopDomain, ids, { admin });
  if (!nodes) return null;

  const problemFor = (productId, variantId, target = "post") => {
    const text = mappingProblemText(productLinkStatus(nodes.get(numericId(productId)) ?? null, variantId), target);
    return text ? { productId, variantId: variantId || null, text } : null;
  };

  const posts = {};
  for (const m of mappings) {
    if (!m.product_id || !m.ig_media_id) continue;
    const problem = problemFor(m.product_id, m.variant_id);
    if (problem) posts[m.ig_media_id] = problem;
  }
  const defaultProduct = defaultId ? problemFor(defaultId, settings?.featured_variant_id, "default") : null;
  return { posts, defaultProduct };
}

/**
 * What kind of destination a sent link has, which decides how it is checked.
 *   cart_add  /cart/add?id=: always broken when the id is a product (422)
 *   cart      cart permalink: checked through the Admin API only, because
 *             fetching it opens a real checkout session on the merchant's store
 *   product   product page
 *   page      collections, policies, the homepage
 */
export function classifyLinkUrl(url) {
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  if (/^\/cart\/add\b/.test(path)) return "cart_add";
  if (/^\/cart\/\d+:\d+/.test(path)) return "cart";
  if (/^\/products\//.test(path)) return "product";
  return "page";
}

const CHECK_WINDOW_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;
const FETCH_GAP_MS = 1000;
// "compatible; ...bot" is the shape storefront analytics filter as a bot, so
// the check does not show up as visits in the merchant's reports.
const CHECK_USER_AGENT = "Mozilla/5.0 (compatible; SocialReplLinkCheck/1.0; +https://www.socialrepl.ai)";
const BROKEN_STATUSES = new Set([404, 410, 422]);

// Links already checked by this process, so a pass every few hours does not
// re-fetch the same pages. Lost on restart, which costs one repeat check.
const _checked = new Set();
let _running = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** HTTP status of a storefront page, or null when it could not be fetched. */
async function fetchStatus(url) {
  try {
    const target = new URL(url);
    // Query carries ref/utm attribution; a check must not look like a click.
    target.search = "";
    const res = await fetch(target.toString(), {
      headers: { "user-agent": CHECK_USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => {});
    return res.status;
  } catch {
    return null;
  }
}

/**
 * Why a sent link no longer opens, or null when it does or we cannot tell.
 * @param {{url: string, product_id?: string|null, variant_id?: string|null}} link
 * @param {Map<string, object|null>|null} nodes - product nodes for this shop, null if unknown
 */
export async function brokenLinkReason(link, nodes, { fetchStatusFn = fetchStatus } = {}) {
  const kind = classifyLinkUrl(link.url);
  if (!kind) return "invalid_url";
  if (kind === "cart_add") return "cart_add_with_product_id";

  const status = link.product_id && nodes
    ? productLinkStatus(nodes.get(numericId(link.product_id)) ?? null, link.variant_id)
    : null;

  if (kind === "cart") {
    if (!status) return null;
    return status.state === "ok" ? null : status.reason;
  }
  if (kind === "product" && status) {
    return status.state === "gone" ? status.reason : null;
  }
  const code = await fetchStatusFn(link.url);
  return code && BROKEN_STATUSES.has(code) ? `http_${code}` : null;
}

/**
 * Check links sent in the last day and log the ones that no longer open.
 * @returns {Promise<{checked: number, broken: number}>}
 */
export async function runSentLinkCheck() {
  if (_running) return { checked: 0, broken: 0 };
  _running = true;
  try {
    const since = new Date(Date.now() - CHECK_WINDOW_MS).toISOString();
    const { data: links, error } = await supabase
      .from("links_sent")
      .select("link_id, shop_id, message_id, url, product_id, variant_id, sent_at, failed_reason")
      .gte("sent_at", since)
      .like("url", "http%");
    if (error) throw error;

    const pending = (links || []).filter(
      (l) => l.link_id && l.failed_reason !== "preview" && !_checked.has(l.link_id),
    );
    if (pending.length === 0) return { checked: 0, broken: 0 };

    const { data: logged } = await supabase
      .from("error_logs")
      .select("context")
      .eq("error_type", BROKEN_LINK_ERROR_TYPE)
      .gte("created_at", since);
    const alreadyLogged = new Set((logged || []).map((r) => r.context?.link_id).filter(Boolean));

    const shopIds = [...new Set(pending.map((l) => l.shop_id).filter(Boolean))];
    const { data: shops } = await supabase.from("shops").select("id, shopify_domain").in("id", shopIds);
    const domainById = new Map((shops || []).map((s) => [s.id, s.shopify_domain]));

    // Most browse links in a day point at the same few pages.
    const statusByPage = new Map();
    const fetchOnce = async (url) => {
      const key = url.split("?")[0];
      if (!statusByPage.has(key)) {
        statusByPage.set(key, await fetchStatus(url));
        await sleep(FETCH_GAP_MS);
      }
      return statusByPage.get(key);
    };

    let checked = 0;
    let broken = 0;
    for (const shopId of shopIds) {
      const shopLinks = pending.filter((l) => l.shop_id === shopId);
      const domain = domainById.get(shopId);
      const productIds = shopLinks.map((l) => l.product_id).filter(Boolean);
      const nodes = domain && productIds.length ? await getProductLinkNodes(domain, productIds) : null;

      for (const link of shopLinks) {
        const reason = await brokenLinkReason(link, nodes, { fetchStatusFn: fetchOnce });
        // A cart link we could not check stays pending for the next pass,
        // when the shop may have a session again.
        if (classifyLinkUrl(link.url) !== "cart" || (link.product_id && nodes)) _checked.add(link.link_id);
        checked += 1;
        if (reason && !alreadyLogged.has(link.link_id)) {
          broken += 1;
          console.warn(`[link-health] broken link ${link.link_id} for ${domain || shopId}: ${reason} ${link.url}`);
          await supabase.from("error_logs").insert({
            error_type: BROKEN_LINK_ERROR_TYPE,
            error_message: `${reason}: ${link.url.split("?")[0]}`,
            shop_id: shopId,
            message_id: link.message_id || null,
            context: { link_id: link.link_id, url: link.url, reason, sent_at: link.sent_at },
          });
        }
      }
    }
    if (broken > 0 || checked > 0) logger.debug(`[link-health] checked ${checked} sent links, ${broken} newly broken`);
    return { checked, broken };
  } finally {
    _running = false;
  }
}

/** Broken links logged in the last `days`, newest first, for /admin. */
export async function getRecentBrokenLinks({ days = 7, limit = 50 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("error_logs")
    .select("id, created_at, shop_id, error_message, context, shops(shopify_domain)")
    .eq("error_type", BROKEN_LINK_ERROR_TYPE)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[link-health] broken link read failed:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Shared tracked-link resolution for the redirect routes:
 *   /{linkId}            — short-link domain (srai.link legacy, socialrepl.ai)
 *   /proxy/go/{linkId}   — Shopify app proxy ({store-domain}/a/go/{linkId})
 * Looks up the destination in links_sent and logs the click (browser-like
 * requests only, so crawlers and link previews don't count).
 */

import supabase from "./supabase.server";
import { logClick } from "./db.server";

const BROWSER_UA_PATTERNS = [
  "mozilla/",
  "opera",
  "opr/",
];

function looksLikeBrowser(request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  if (!ua.trim()) return false;
  return BROWSER_UA_PATTERNS.some((p) => ua.includes(p));
}

async function fetchLinkUrl(linkId) {
  const { data: row, error } = await supabase
    .from("links_sent")
    .select("url")
    .eq("link_id", linkId)
    .maybeSingle();
  if (error) return null;
  return row?.url || null;
}

/**
 * Resolve a link_id to its destination URL, logging the click when
 * appropriate. Returns the URL string, or null when the link doesn't exist.
 */
export async function resolveTrackedLink(linkId, request) {
  if (!linkId) return null;

  let url = await fetchLinkUrl(linkId);
  if (!url) {
    // Race guard: Instagram fetches the link preview the instant a DM is
    // delivered, which can arrive before the links_sent insert commits.
    // Links are now persisted before sending, but one brief retry keeps
    // queued sends and any remaining ordering edge from 404ing the preview.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    url = await fetchLinkUrl(linkId);
  }
  if (!url) return null;

  // Every link type is logged, info_ included. The analytics KPIs filter to
  // checkout links via isCheckoutLinkId before counting, so this moves no
  // number a merchant sees; it just stops browse links being the one thing we
  // send in volume and know nothing about. An unmapped post can only answer
  // with an info_ link, so "does anyone click those?" decides how much the
  // product-mapping gap actually costs.
  if (looksLikeBrowser(request)) {
    const userAgent = request.headers.get("user-agent") || null;
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : null;
    try {
      await logClick({ linkId, userAgent, ip });
    } catch (e) {
      console.warn("[redirect] logClick failed:", e?.message);
    }
  }

  return url;
}

/**
 * Shared tracked-link resolution for the redirect routes:
 *   /{linkId}            — short-link domain (srai.link legacy, socialrepl.ai)
 *   /proxy/go/{linkId}   — Shopify app proxy ({store-domain}/a/go/{linkId})
 * Looks up the destination in links_sent and logs the click (browser-like
 * requests only, and never for info_ housekeeping links).
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

/**
 * Resolve a link_id to its destination URL, logging the click when
 * appropriate. Returns the URL string, or null when the link doesn't exist.
 */
export async function resolveTrackedLink(linkId, request) {
  if (!linkId) return null;

  const { data: row, error } = await supabase
    .from("links_sent")
    .select("url")
    .eq("link_id", linkId)
    .maybeSingle();

  if (error || !row?.url) return null;

  const isInfoLink = linkId.startsWith("info_");
  if (!isInfoLink && looksLikeBrowser(request)) {
    const userAgent = request.headers.get("user-agent") || null;
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : null;
    try {
      await logClick({ linkId, userAgent, ip });
    } catch (e) {
      console.warn("[redirect] logClick failed:", e?.message);
    }
  }

  return row.url;
}

/**
 * Click tracking redirect: /c/:linkId
 * Looks up the link in links_sent, logs the click (only for browser-like requests), then redirects to the stored URL.
 * We only count requests that look like real browsers (User-Agent allowlist); crawlers/preview bots never send browser UAs.
 */
import { redirect } from "react-router";
import supabase from "../lib/supabase.server";
import { logClick } from "../lib/db.server";

/** User-Agent must contain one of these to be counted as a real click (browsers and in-app browsers send these). */
const BROWSER_UA_PATTERNS = [
  "mozilla/",      // All major browsers (Chrome, Safari, Firefox, Edge, Instagram in-app, etc.)
  "opera",
  "opr/",
];

function looksLikeBrowser(request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  if (!ua.trim()) return false;
  return BROWSER_UA_PATTERNS.some((p) => ua.includes(p));
}

export async function loader({ params, request }) {
  const linkId = params.linkId;
  if (!linkId) {
    return new Response("Not Found", { status: 404 });
  }

  const { data: row, error } = await supabase
    .from("links_sent")
    .select("url")
    .eq("link_id", linkId)
    .maybeSingle();

  if (error || !row?.url) {
    return new Response("Not Found", { status: 404 });
  }

  const shouldLogClick = looksLikeBrowser(request);
  if (shouldLogClick) {
    const userAgent = request.headers.get("user-agent") || null;
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : null;
    try {
      await logClick({ linkId, userAgent, ip });
    } catch (e) {
      console.warn("[c] logClick failed:", e?.message);
    }
  }

  return redirect(row.url, 302);
}

export default function ClickRedirect() {
  return null;
}

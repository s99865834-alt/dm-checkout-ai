/**
 * Root-level click tracking redirect: /:linkId
 * Looks up the link in links_sent, logs the click (browser-like requests only), then redirects.
 * Keeps URLs short (no /c/ prefix). c.$linkId.jsx remains for backward compatibility with /c/{id}.
 */
import { redirect } from "react-router";
import supabase from "../lib/supabase.server";
import { logClick } from "../lib/db.server";

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
      console.warn("[redirect] logClick failed:", e?.message);
    }
  }

  return redirect(row.url, 302);
}

export default function RootRedirect() {
  return null;
}

/**
 * Click tracking redirect: /c/:linkId
 * Looks up the link in links_sent, logs the click (unless from a preview bot), then redirects to the stored URL.
 * Links sent in comment/DM replies use this URL so analytics can count clicks.
 */
import { redirect } from "react-router";
import supabase from "../lib/supabase.server";
import { logClick } from "../lib/db.server";

/** User-Agent substrings for link-preview/crawler bots; we still redirect but don't count as a click. */
const PREVIEW_BOT_UA_PATTERNS = [
  "facebookexternalhit",
  "facebot",
  "facebookbot",
  "facebookcatalog",
  "whatsapp",
  "telegrambot",
  "twitterbot",
  "linkedinbot",
  "slurp",
  "discordbot",
  "embed",
  "preview",
];

function isPreviewBot(request) {
  const ua = (request.headers.get("user-agent") || "").toLowerCase();
  return PREVIEW_BOT_UA_PATTERNS.some((p) => ua.includes(p));
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

  const shouldLogClick = !isPreviewBot(request);
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

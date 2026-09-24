/**
 * HTML for tracked-link preview crawlers and the Shopify app-proxy bounce.
 *
 * Instagram (and Facebook) unfurl a link by fetching it as facebookexternalhit
 * and reading Open Graph tags. Our proxy page used to be titled "Redirecting…"
 * with no image, which is what customers saw as the empty refresh card.
 *
 * Same HTML for humans and crawlers: OG tags plus an instant meta-refresh.
 * Different HTML for the crawler would be cloaking. We only *fetch* extra
 * product title/image when the UA is a preview bot, so real clicks stay fast.
 *
 * Do not use the generic isbot() list here. That flags Node, curl, and
 * GitHub Actions fetch, which would serve OG HTML instead of a 302 and
 * break the production smoke test. Only named unfurl crawlers need the card.
 */

import {
  isSafeLinkId,
  linkRefValue,
  REF_COOKIE_NAME,
  REF_COOKIE_MAX_AGE_SEC,
} from "./link-attribution";

const LINK_PREVIEW_UA = [
  "facebookexternalhit",
  "facebot",
  "meta-externalagent",
  "meta-externalfetcher",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "whatsapp",
  "discordbot",
];

export const DEFAULT_LINK_PREVIEW = {
  title: "Continue to checkout",
  description: "Opens checkout to finish your order.",
  imageUrl: null,
};

export function isLinkPreviewCrawler(request) {
  const ua = request?.headers?.get?.("user-agent") || "";
  if (!ua.trim()) return false;
  const lower = ua.toLowerCase();
  return LINK_PREVIEW_UA.some((p) => lower.includes(p));
}

export function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function lastClickScript(destinationUrl, linkId) {
  if (!isSafeLinkId(linkId)) {
    return `<script>window.location.replace(${JSON.stringify(destinationUrl)});</script>`;
  }
  const ref = linkRefValue(linkId);
  const cookie = `${REF_COOKIE_NAME}=${ref}; Max-Age=${REF_COOKIE_MAX_AGE_SEC}; Path=/; SameSite=Lax`;
  return `<script>(function(){
var dest=${JSON.stringify(destinationUrl)};
var ref=${JSON.stringify(ref)};
document.cookie=${JSON.stringify(cookie)};
try{fetch("/cart/update.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({attributes:{ref:ref}}),keepalive:true,credentials:"same-origin"});}catch(e){}
window.location.replace(dest);
})();</script>`;
}

/**
 * Instant client-side redirect page with Open Graph tags for DM link previews.
 *
 * On a real storefront click we also drop a 30-day last-click cookie and stamp
 * the cart. Shopify app-proxy pages can run same-origin JS; they cannot rely
 * on Set-Cookie surviving a 302.
 *
 * @param {{
 *   destinationUrl: string,
 *   title?: string,
 *   description?: string,
 *   imageUrl?: string|null,
 *   persistLastClick?: boolean,
 *   linkId?: string|null,
 * }} opts
 */
export function buildTrackedLinkPageHtml({
  destinationUrl,
  title = DEFAULT_LINK_PREVIEW.title,
  description = DEFAULT_LINK_PREVIEW.description,
  imageUrl = null,
  persistLastClick = false,
  linkId = null,
}) {
  const safeUrl = escapeHtml(destinationUrl);
  const safeTitle = escapeHtml(title || DEFAULT_LINK_PREVIEW.title);
  const safeDescription = escapeHtml(description || DEFAULT_LINK_PREVIEW.description);
  const imageTags =
    isHttpUrl(imageUrl)
      ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">
<meta name="twitter:image" content="${escapeHtml(imageUrl)}">
<meta name="twitter:card" content="summary_large_image">`
      : `<meta name="twitter:card" content="summary">`;
  const redirectScript = persistLastClick
    ? lastClickScript(destinationUrl, linkId)
    : `<script>window.location.replace(${JSON.stringify(destinationUrl)});</script>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${safeUrl}">
<title>${safeTitle}</title>
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:type" content="website">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
${imageTags}
</head>
<body>
${redirectScript}
<noscript><a href="${safeUrl}">Continue</a></noscript>
</body>
</html>`;
}

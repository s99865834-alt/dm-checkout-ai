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

/** How long a click waits for the cart stamp before leaving anyway. */
const CART_STAMP_WAIT_MS = 2000;

/**
 * Checkout permalinks carry attributes[ref] in the URL, and Shopify rebuilds
 * the cart from that permalink. Waiting on /cart/update.js first would delay
 * the click to set an attribute the destination sets anyway.
 */
export function destinationCarriesCartRef(url) {
  if (typeof url !== "string") return false;
  return url.includes("attributes[ref]") || url.toLowerCase().includes("attributes%5bref%5d");
}

function lastClickScript(destinationUrl, linkId, { wait = true } = {}) {
  if (!isSafeLinkId(linkId)) {
    return `<script>window.location.replace(${JSON.stringify(destinationUrl)});</script>`;
  }
  const ref = linkRefValue(linkId);
  if (!wait) {
    const quickCookie = `${REF_COOKIE_NAME}=${ref}; Max-Age=${REF_COOKIE_MAX_AGE_SEC}; Path=/; Secure; SameSite=Lax`;
    return `<script>(function(){
document.cookie=${JSON.stringify(quickCookie)};
window.location.replace(${JSON.stringify(destinationUrl)});
})();</script>`;
  }
  const cookie = `${REF_COOKIE_NAME}=${ref}; Max-Age=${REF_COOKIE_MAX_AGE_SEC}; Path=/; Secure; SameSite=Lax`;
  // Wait for /cart/update.js. A 0-second meta refresh used to navigate first,
  // and the Instagram in-app browser cancelled the stamp. GET /cart.js first
  // when the update fails, because a brand-new visitor has no cart yet.
  // The order webhook reads this cart attribute. The cookie is what a later
  // page reapplies if this cart gets replaced.
  return `<script>(function(){
var dest=${JSON.stringify(destinationUrl)};
var ref=${JSON.stringify(ref)};
document.cookie=${JSON.stringify(cookie)};
var left=false;
function go(){if(left)return;left=true;window.location.replace(dest);}
function post(){return fetch("/cart/update.js",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",keepalive:true,body:JSON.stringify({attributes:{ref:ref}})}).then(function(r){if(!r.ok)throw new Error("cart");});}
var timer=setTimeout(go,${CART_STAMP_WAIT_MS});
post().catch(function(){return fetch("/cart.js",{credentials:"same-origin"}).then(function(){return post();});}).then(function(){clearTimeout(timer);go();},function(){clearTimeout(timer);go();});
})();</script>`;
}

/**
 * Instant client-side redirect page with Open Graph tags for DM link previews.
 *
 * On a real storefront click we stamp the cart, then redirect. The instant
 * meta refresh stays off for that page: it was winning the race and the cart
 * attribute never landed. Browsers without JS still get a noscript refresh.
 * Shopify app-proxy pages can run same-origin JS; they cannot rely on
 * Set-Cookie surviving a 302.
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
  // Only browse and product links need the cart stamped before leaving.
  const waitsForCartStamp =
    persistLastClick && isSafeLinkId(linkId) && !destinationCarriesCartRef(destinationUrl);
  const redirectScript = persistLastClick
    ? lastClickScript(destinationUrl, linkId, { wait: waitsForCartStamp })
    : `<script>window.location.replace(${JSON.stringify(destinationUrl)});</script>`;
  // Instant refresh only when we are not waiting on the cart stamp. Inside
  // noscript it still fires for browsers that cannot run the script.
  const refreshTag = waitsForCartStamp
    ? `<noscript><meta http-equiv="refresh" content="0;url=${safeUrl}"></noscript>`
    : `<meta http-equiv="refresh" content="0;url=${safeUrl}">`;
  const waitingNote = waitsForCartStamp ? `<p>Continuing to the store.</p>` : "";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
${refreshTag}
<title>${safeTitle}</title>
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:type" content="website">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
${imageTags}
</head>
<body>
${waitingNote}
${redirectScript}
<noscript><a href="${safeUrl}">Continue</a></noscript>
</body>
</html>`;
}

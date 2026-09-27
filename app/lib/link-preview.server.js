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

import { isSafeLinkId, linkRefValue } from "./link-attribution";

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

function plainRedirectScript(destinationUrl) {
  return `<script>window.location.replace(${JSON.stringify(destinationUrl)});</script>`;
}

/**
 * Put the link reference on the cart, then leave.
 *
 * Browse and product links have no attributes[ref] of their own, so this POST
 * is the only thing that gets the reference onto the cart the order will be
 * placed from. It has to finish first: a 0-second meta refresh used to
 * navigate away and the Instagram in-app browser cancelled the request. A new
 * visitor has no cart yet, so a failed update retries after GET /cart.js.
 */
function cartStampScript(destinationUrl, linkId) {
  const ref = linkRefValue(linkId);
  return `<script>(function(){
var dest=${JSON.stringify(destinationUrl)};
var ref=${JSON.stringify(ref)};
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
 * On a real storefront click through the app proxy we stamp the cart first,
 * then redirect. The instant meta refresh stays off for that page: it was
 * winning the race and the cart attribute never landed. Browsers without JS
 * still get a noscript refresh.
 *
 * @param {{
 *   destinationUrl: string,
 *   title?: string,
 *   description?: string,
 *   imageUrl?: string|null,
 *   stampCart?: boolean,
 *   linkId?: string|null,
 * }} opts
 */
export function buildTrackedLinkPageHtml({
  destinationUrl,
  title = DEFAULT_LINK_PREVIEW.title,
  description = DEFAULT_LINK_PREVIEW.description,
  imageUrl = null,
  stampCart = false,
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
  const stampsCart =
    stampCart && isSafeLinkId(linkId) && !destinationCarriesCartRef(destinationUrl);
  const redirectScript = stampsCart
    ? cartStampScript(destinationUrl, linkId)
    : plainRedirectScript(destinationUrl);
  // Instant refresh only when we are not waiting on the cart stamp. Inside
  // noscript it still fires for browsers that cannot run the script.
  const refreshTag = stampsCart
    ? `<noscript><meta http-equiv="refresh" content="0;url=${safeUrl}"></noscript>`
    : `<meta http-equiv="refresh" content="0;url=${safeUrl}">`;
  const waitingNote = stampsCart ? `<p>Continuing to the store.</p>` : "";

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

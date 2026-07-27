/**
 * App-proxy click redirect: {store-domain}/a/go/{linkId} → destination.
 *
 * Shopify forwards storefront requests for /a/go/* here (see [app_proxy] in
 * shopify.app.toml). This puts DM tracking links on the merchant's OWN domain
 * — on-brand, and immune to shortener-domain blocklists (each link inherits
 * the store's reputation).
 *
 * Why not a 302: Shopify's proxy follows 30x responses server-side and strips
 * Set-Cookie headers, which breaks cart permalinks (the cart would never
 * populate). Instead we return a tiny instant client-side redirect page; the
 * browser then requests the destination directly on the store domain, with
 * cookies working normally.
 *
 * No signature check on purpose: link destinations are public data (the same
 * lookup is served openly at /{linkId}), so verifying the proxy HMAC would
 * add nothing except a failure mode.
 */

import { resolveTrackedLink } from "../lib/click-redirect.server";

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function loader({ params, request }) {
  const url = await resolveTrackedLink(params.linkId, request);
  if (!url) {
    return new Response("Not Found", { status: 404 });
  }

  // Defense-in-depth: only ever bounce to http(s) destinations.
  if (!/^https?:\/\//i.test(url)) {
    return new Response("Not Found", { status: 404 });
  }

  const safeUrl = escapeHtml(url);
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${safeUrl}">
<title>Redirecting…</title>
</head>
<body>
<script>window.location.replace(${JSON.stringify(url)});</script>
<noscript><a href="${safeUrl}">Continue</a></noscript>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function action() {
  return new Response("Method Not Allowed", { status: 405 });
}

export default function ProxyRedirect() {
  return null;
}

/**
 * App-proxy click redirect: {store-domain}/a/go/{linkId} to destination.
 *
 * Shopify forwards storefront requests for /a/go/* here (see [app_proxy] in
 * shopify.app.toml). This puts DM tracking links on the merchant's own domain:
 * on-brand, and immune to shortener-domain blocklists (each link inherits
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

import { serveTrackedLink } from "../lib/click-redirect.server";

export async function loader({ params, request }) {
  return serveTrackedLink(params.linkId, request, { alwaysHtml: true });
}

export async function action() {
  return new Response("Method Not Allowed", { status: 405 });
}

// No default component export on purpose: this must stay a resource route.
// With a component export, React Router SSR-renders the (null) component
// document instead of returning the loader's HTML redirect page verbatim,
// customers clicking DM links saw a blank white page on the store domain.

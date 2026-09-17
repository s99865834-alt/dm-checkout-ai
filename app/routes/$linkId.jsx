/**
 * Root-level click tracking redirect: /:linkId
 * Looks up the link in links_sent (shared logic in click-redirect.server.js),
 * logs the click, then redirects. Serves the short-link domains (legacy
 * srai.link, socialrepl.ai). Merchant-domain links go through the app proxy
 * route (proxy.go.$linkId.jsx) instead.
 * c.$linkId.jsx remains for backward compatibility with /c/{id}.
 *
 * Preview crawlers get the HTML bounce (Open Graph tags) instead of a 302,
 * because Instagram reads the first response body for the DM card.
 */
import { serveTrackedLink } from "../lib/click-redirect.server";

export async function loader({ params, request }) {
  return serveTrackedLink(params.linkId, request);
}

export async function action() {
  return new Response("Method Not Allowed", { status: 405 });
}

// No default component export on purpose: keeps this a resource route so the
// loader's redirect/404 responses are returned verbatim without page rendering.

/**
 * Root-level click tracking redirect: /:linkId
 * Looks up the link in links_sent (shared logic in click-redirect.server.js),
 * logs the click, then redirects. Serves the short-link domains (legacy
 * srai.link, socialrepl.ai). Merchant-domain links go through the app proxy
 * route (proxy.go.$linkId.jsx) instead.
 * c.$linkId.jsx remains for backward compatibility with /c/{id}.
 */
import { redirect } from "react-router";
import { resolveTrackedLink } from "../lib/click-redirect.server";

export async function loader({ params, request }) {
  const url = await resolveTrackedLink(params.linkId, request);
  if (!url) {
    return new Response("Not Found", { status: 404 });
  }
  return redirect(url, 302);
}

export async function action() {
  return new Response("Method Not Allowed", { status: 405 });
}

export default function RootRedirect() {
  return null;
}

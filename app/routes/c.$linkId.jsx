/**
 * Click tracking redirect: /c/:linkId
 * Legacy path. Same behavior as /:linkId.
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

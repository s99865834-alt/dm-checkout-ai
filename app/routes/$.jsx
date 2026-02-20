/**
 * Catch-all route for paths that don't match any other route.
 * Prevents "No route matches URL" errors and stack traces for bot/scanner
 * requests (e.g. wp-includes/wlwmanifest.xml, wp-admin, /_next/, /en/, etc.).
 */
export async function loader() {
  throw new Response("Not Found", { status: 404 });
}

/** Handle POST to unmatched paths (e.g. bots to /_next/, /en/, /api/) - return 405 without throwing. */
export async function action() {
  return new Response("Method Not Allowed", { status: 405 });
}

export default function CatchAll() {
  return null;
}

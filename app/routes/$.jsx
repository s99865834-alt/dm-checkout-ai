/**
 * Catch-all route for paths that don't match any other route.
 * Return 404 without throwing so bot/scanner requests (wp-includes, etc.)
 * don't flood logs with ErrorResponseImpl.
 */
export async function loader() {
  return new Response("Not Found", { status: 404 });
}

/** Handle POST to unmatched paths (e.g. bots to /_next/, /en/, /api/) - return 405 without throwing. */
export async function action() {
  return new Response("Method Not Allowed", { status: 405 });
}

export default function CatchAll() {
  return null;
}

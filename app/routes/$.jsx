/**
 * Catch-all route for paths that don't match any other route.
 * Prevents "No route matches URL" errors and stack traces for bot/scanner
 * requests (e.g. wp-includes/wlwmanifest.xml, wp-admin, etc.).
 */
export async function loader() {
  throw new Response("Not Found", { status: 404 });
}

export default function CatchAll() {
  return null;
}

/**
 * Serve robots.txt to avoid 404s from crawlers and browser preload.
 */
export async function loader() {
  const body = "User-agent: *\nDisallow:\n";
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export default function RobotsTxt() {
  return null;
}

/**
 * robots.txt — explicitly welcomes AI crawlers (GEO) and points at the sitemap.
 * Marketing pages are open; embedded-app, auth, webhook, and tracked-link
 * routes are excluded since they're useless (or misleading) to crawlers.
 */
const DISALLOWED_PATHS = [
  "/app",
  "/auth",
  "/admin",
  "/webhooks",
  "/cron",
  "/meta",
  "/c/",
];

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
];

export async function loader() {
  const disallows = DISALLOWED_PATHS.map((p) => `Disallow: ${p}`).join("\n");

  const aiGroups = AI_CRAWLERS.map(
    (bot) => `User-agent: ${bot}\nAllow: /\n${disallows}`
  ).join("\n\n");

  const body = `# www.socialrepl.ai — AI crawlers are welcome.
# See also: https://www.socialrepl.ai/llms.txt

User-agent: *
Allow: /
${disallows}

${aiGroups}

Sitemap: https://www.socialrepl.ai/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * Dry-run the DM sales agent against a real store, without sending anything.
 * generateAgentReply only produces text + tracked link IDs — claiming, sending,
 * and usage accounting live in handleIncomingDm — so this is side-effect-free
 * apart from possible info_ short-link rows for store-page URLs.
 *
 * Usage: npx vite-node scripts/test-sales-agent.mjs <shop-domain> "<message>"
 */
import fs from "fs";

// Load .env into process.env BEFORE importing app modules (they read env at import time).
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const [shopDomain, text] = process.argv.slice(2);
if (!shopDomain || !text) {
  console.error('Usage: npx vite-node scripts/test-sales-agent.mjs <shop-domain> "<message>"');
  process.exit(1);
}

const { default: supabase } = await import("../app/lib/supabase.server.js");
const { generateAgentReply, REPLY_MODEL } = await import("../app/lib/sales-agent.server.js");
const { getRecentConversationContext } = await import("../app/lib/db.server.js");

const { data: shop, error } = await supabase
  .from("shops")
  .select("id, shopify_domain")
  .eq("shopify_domain", shopDomain)
  .single();
if (error || !shop) {
  console.error("Shop not found:", error?.message);
  process.exit(1);
}

const { data: brandVoice } = await supabase
  .from("brand_voice")
  .select("*")
  .eq("shop_id", shop.id)
  .maybeSingle();

const threadContext = await getRecentConversationContext(shop.id, "test-user", {
  windowHours: 72,
  maxMessages: 25,
  maxLinks: 25,
}).catch(() => null);

console.log(`Model: ${REPLY_MODEL}`);
console.log(`Shop: ${shop.shopify_domain} (${shop.id})`);
console.log(`Message: "${text}"\n`);

const started = Date.now();
const result = await generateAgentReply({
  shop,
  message: { id: null, text, ai_entities: null },
  intent: null,
  brandVoice: brandVoice || null,
  threadContext,
  allowClarify: true,
});
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

if (!result) {
  console.log(`Agent declined (would fall back to legacy pipeline). [${elapsed}s]`);
  process.exit(0);
}

console.log(`--- Reply (${elapsed}s) ---`);
console.log(result.text);
console.log(`--- Tracked links minted: ${result.links.length} ---`);
for (const l of result.links) {
  console.log(`  ${l.linkId}  product=${l.productId}  variant=${l.variantId || "-"}\n    -> ${l.url}`);
}

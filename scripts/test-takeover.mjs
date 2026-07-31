/**
 * One-off check of the human-takeover pause helpers against the real DB.
 * Uses a fake ig_user_id and cleans up after itself.
 *
 *   npx vite-node -c scripts/vite-node.config.mjs scripts/test-takeover.mjs <shop-domain>
 */
import fs from "fs";

for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const shopDomain = process.argv[2];
const { default: supabase } = await import("../app/lib/supabase.server.js");
const { recordHumanTakeover, isHumanTakeoverActive } = await import("../app/lib/db.server.js");

const { data: shop } = await supabase
  .from("shops")
  .select("id")
  .eq("shopify_domain", shopDomain)
  .single();
if (!shop) {
  console.error("Shop not found");
  process.exit(1);
}

const TEST_USER = "test_takeover_user_000";
let failed = false;
const check = (name, got, expected) => {
  const ok = got === expected;
  console.log(`${ok ? "pass" : "FAIL"}: ${name} (got ${got}, expected ${expected})`);
  if (!ok) failed = true;
};

// Baseline: no takeover recorded
check("inactive before record", await isHumanTakeoverActive(shop.id, TEST_USER), false);

// Record → active
await recordHumanTakeover(shop.id, TEST_USER);
check("active after record", await isHumanTakeoverActive(shop.id, TEST_USER), true);

// Re-record (upsert path, must not error) → still active
await recordHumanTakeover(shop.id, TEST_USER);
check("active after re-record (rolling reset)", await isHumanTakeoverActive(shop.id, TEST_USER), true);

// Age the record past the 24h window → inactive
await supabase
  .from("human_takeovers")
  .update({ last_human_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
  .eq("shop_id", shop.id)
  .eq("ig_user_id", TEST_USER);
check("inactive after 25h", await isHumanTakeoverActive(shop.id, TEST_USER), false);

// Cleanup
await supabase.from("human_takeovers").delete().eq("shop_id", shop.id).eq("ig_user_id", TEST_USER);
console.log("(cleaned up test row)");
process.exit(failed ? 1 : 0);

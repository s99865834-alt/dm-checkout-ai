/**
 * Production smoke test — verifies the customer-facing link paths against the
 * LIVE deployment, asserting on actual response bodies (not just status codes).
 *
 * Exists because of the Aug 2026 blank-page incident: the app-proxy redirect
 * route returned HTTP 200 while serving an empty page, so every DM link click
 * on a merchant domain silently failed. Status-code checks can't catch that
 * class of bug; these checks assert the redirect payload itself.
 *
 * Uses the permanent canary row in links_sent (link_id "info_canary" →
 * https://www.socialrepl.ai). info_ links are excluded from click analytics,
 * so the canary never pollutes merchant dashboards.
 *
 * Run: node scripts/smoke-prod.mjs   (exits 1 on any failure)
 * Ran automatically by .github/workflows/smoke.yml on a schedule.
 */

const BASE = process.env.SMOKE_BASE_URL || "https://dm-checkout-ai-production.up.railway.app";
const CANARY = "info_canary";
const CANARY_DEST = "https://www.socialrepl.ai";

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures.push(name);
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

await check("health endpoint reports ok + production", async () => {
  const res = await fetch(`${BASE}/health`);
  assert(res.status === 200, `status ${res.status}`);
  const body = await res.json();
  assert(body.status === "ok", `status field: ${JSON.stringify(body)}`);
  assert(body.mode === "production", `mode field: ${JSON.stringify(body)}`);
});

await check("app-proxy link serves a real redirect page (blank-page guard)", async () => {
  const res = await fetch(`${BASE}/proxy/go/${CANARY}`);
  assert(res.status === 200, `status ${res.status}`);
  const html = await res.text();
  // The three things a working redirect page must contain. A React-rendered
  // empty document (the failure mode this guards against) has none of them.
  assert(html.includes("window.location.replace"), "missing JS redirect");
  assert(html.includes('http-equiv="refresh"'), "missing meta refresh");
  assert(html.includes(CANARY_DEST), "missing canary destination URL");
});

await check("root short link 302-redirects to destination", async () => {
  const res = await fetch(`${BASE}/${CANARY}`, { redirect: "manual" });
  assert(res.status === 302 || res.status === 301, `status ${res.status}`);
  const loc = res.headers.get("location") || "";
  assert(loc.startsWith(CANARY_DEST), `location: ${loc}`);
});

await check("unknown link returns 404 (not a rendered page)", async () => {
  const res = await fetch(`${BASE}/proxy/go/info_does_not_exist_smoke`, { redirect: "manual" });
  assert(res.status === 404, `status ${res.status}`);
});

await check("webhook route rejects GET with 405", async () => {
  const res = await fetch(`${BASE}/webhooks/shopify/orders`, { redirect: "manual" });
  assert(res.status === 405, `status ${res.status}`);
});

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll smoke checks passed");

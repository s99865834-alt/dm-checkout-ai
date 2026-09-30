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

// A short-link click must be handed to the merchant's own storefront, not sent
// straight to the destination. Only the storefront's origin can POST
// /cart/update.js, so a direct 302 is exactly what made every shop without a
// custom domain unattributable (20 of 35 active shops on 29 Sep 2026). This
// check used to assert the direct redirect and so it failed the moment that
// was fixed; it now asserts the handoff, which is the behaviour attribution
// depends on. The destination payload itself is covered by the app-proxy check
// above.
await check("root short link hands the click to the store's app proxy", async () => {
  const res = await fetch(`${BASE}/${CANARY}`, {
    redirect: "manual",
    headers: {
      // Must look like a browser. After the OG preview change, unfurl bots
      // (and Node's default fetch UA, if treated as a bot) get HTML 200.
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  assert(res.status === 302 || res.status === 301, `status ${res.status}`);
  const loc = res.headers.get("location") || "";
  assert(loc.startsWith("https://"), `location not https: ${loc}`);
  assert(loc.endsWith(`/a/go/${CANARY}`), `not an app-proxy handoff: ${loc}`);
  // Guard against pointing the handoff back at ourselves, which would 404:
  // the app serves /proxy/go/, only a storefront serves /a/go/.
  assert(!loc.startsWith(BASE), `handoff points at the app, not a store: ${loc}`);
});

await check("preview crawler gets Open Graph HTML instead of a bare 302", async () => {
  const res = await fetch(`${BASE}/${CANARY}`, {
    redirect: "manual",
    headers: {
      "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    },
  });
  assert(res.status === 200, `status ${res.status}`);
  const html = await res.text();
  assert(html.includes("og:title"), "missing og:title");
  assert(html.includes(CANARY_DEST), "missing canary destination URL");
  assert(!html.includes("Redirecting"), "old Redirecting title leaked back");
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

/**
 * Verify every rotated credential actually works, before trusting the app.
 *
 * Written after the Railway security disclosure of 21 Oct 2026, where the
 * advice was to rotate API keys, database passwords and access tokens. Each
 * of those lives in a different dashboard, and a typo in any one of them fails
 * in a different place: a bad OpenAI key produces silent non-replies, a bad
 * ENCRYPTION_KEY_32B disconnects every merchant, and a bad SHOPIFY_API_SECRET
 * makes webhooks reject real deliveries.
 *
 * Reads secrets from .env, so run it locally against the same values you put
 * into Railway. It is read-only: nothing is written and no merchant-visible
 * message is sent.
 *
 * Modules that throw on a bad key at import time are loaded inside their own
 * check, so a misconfigured value reports as one failure rather than crashing
 * the whole run.
 *
 * Usage:
 *   npx vite-node --config scripts/vite-node.config.mjs scripts/post-rotation-check.mjs
 */
import "dotenv/config";

const BASE = process.env.SMOKE_BASE_URL || "https://dm-checkout-ai-production.up.railway.app";
const failures = [];

async function check(name, fn) {
  try {
    const note = await fn();
    console.log(`PASS  ${name}${note ? ` (${note})` : ""}`);
  } catch (err) {
    failures.push(name);
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function required(name) {
  const value = process.env[name];
  assert(value && value.trim() !== "", `${name} is not set`);
  return value;
}

// ── Secrets that only need to be present and well formed ────────────────────

await check("ENCRYPTION_KEY_32B parses as a 32-byte key", async () => {
  required("ENCRYPTION_KEY_32B");
  const { encryptToken, decryptToken } = await import("../app/lib/crypto.server.js");
  const probe = "post-rotation-probe";
  assert(decryptToken(encryptToken(probe)) === probe, "round trip did not return the input");
  return process.env.ENCRYPTION_KEY_32B_OLD ? "old key also present, rotation in progress" : "single key";
});

// ── Database ────────────────────────────────────────────────────────────────

await check("SUPABASE_SERVICE_ROLE_KEY can read the database", async () => {
  required("SUPABASE_URL");
  required("SUPABASE_SERVICE_ROLE_KEY");
  const { default: supabase } = await import("../app/lib/supabase.server.js");
  const { error, count } = await supabase.from("shops").select("id", { count: "exact", head: true });
  assert(!error, error?.message || "unknown error");
  return `${count} shops`;
});

await check("DATABASE_URL can reach Postgres through Prisma", async () => {
  required("DATABASE_URL");
  const { default: prisma } = await import("../app/db.server.js");
  const count = await prisma.session.count();
  return `${count} sessions`;
});

// ── Stored tokens still decrypt under the current key ───────────────────────

await check("every stored Meta token decrypts", async () => {
  const { default: supabase } = await import("../app/lib/supabase.server.js");
  const { decryptToken } = await import("../app/lib/crypto.server.js");
  const { data, error } = await supabase
    .from("meta_auth")
    .select("shop_id, user_token_enc, page_token_enc, ig_token_enc");
  assert(!error, error?.message || "unknown error");

  const broken = [];
  for (const row of data) {
    for (const column of ["user_token_enc", "page_token_enc", "ig_token_enc"]) {
      if (!row[column]) continue;
      try {
        assert(decryptToken(row[column]).length > 0, "decrypted to empty");
      } catch {
        broken.push(`${row.shop_id}.${column}`);
      }
    }
  }
  assert(broken.length === 0, `${broken.length} undecryptable: ${broken.slice(0, 3).join(", ")}`);
  return `${data.length} connected accounts`;
});

await check("every stored Shopify token decrypts", async () => {
  const { default: supabase } = await import("../app/lib/supabase.server.js");
  const { decryptToken } = await import("../app/lib/crypto.server.js");
  const { SECRET_FIELDS, looksPlaintext } = await import("../app/lib/session-crypto.server.js");
  const { data, error } = await supabase.from("Session").select(`shop, ${SECRET_FIELDS.join(", ")}`);
  assert(!error, error?.message || "unknown error");

  const broken = [];
  let stillPlaintext = 0;
  for (const row of data) {
    for (const field of SECRET_FIELDS) {
      const value = row[field];
      if (typeof value !== "string" || value === "") continue;
      if (looksPlaintext(value)) {
        stillPlaintext += 1;
        continue;
      }
      try {
        assert(decryptToken(value).length > 0, "decrypted to empty");
      } catch {
        broken.push(`${row.shop}.${field}`);
      }
    }
  }
  assert(broken.length === 0, `${broken.length} undecryptable: ${broken.slice(0, 3).join(", ")}`);
  return stillPlaintext > 0
    ? `${stillPlaintext} still plaintext, run encrypt-session-tokens.mjs --apply`
    : `${data.length} sessions, all encrypted`;
});

// ── Third-party credentials ─────────────────────────────────────────────────

await check("OPENAI_API_KEY is accepted by OpenAI", async () => {
  const key = required("OPENAI_API_KEY");
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${key}` },
  });
  assert(res.status !== 401, "401 unauthorized, key is wrong or revoked");
  assert(res.ok, `status ${res.status}`);
  return "authenticated";
});

await check("META_APP_SECRET is accepted by Meta", async () => {
  const id = required("META_APP_ID");
  const secret = required("META_APP_SECRET");
  const url = new URL("https://graph.facebook.com/oauth/access_token");
  url.searchParams.set("client_id", id);
  url.searchParams.set("client_secret", secret);
  url.searchParams.set("grant_type", "client_credentials");
  const res = await fetch(url);
  const body = await res.json();
  assert(res.ok && body.access_token, body?.error?.message || `status ${res.status}`);
  return "app token issued";
});

await check("META_INSTAGRAM_APP_SECRET is set", async () => {
  required("META_INSTAGRAM_APP_ID");
  required("META_INSTAGRAM_APP_SECRET");
  // Instagram Login apps have no client_credentials grant to probe, so this
  // only confirms presence. A wrong value surfaces at the next OAuth connect.
  return "present, not verifiable without an OAuth round trip";
});

await check("SHOPIFY_API_SECRET verifies its own webhook signatures", async () => {
  required("SHOPIFY_API_SECRET");
  const { verifyShopifyWebhookHmac } = await import("../app/lib/shopify-webhook-hmac.server.js");
  const crypto = await import("crypto");
  const body = JSON.stringify({ probe: true });
  const good = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET)
    .update(body, "utf8")
    .digest("base64");
  assert(verifyShopifyWebhookHmac(body, good), "a correctly signed body was rejected");
  assert(!verifyShopifyWebhookHmac(body, "bogus"), "a forged signature was accepted");
  return "signs and rejects correctly";
});

// ── The live deployment ─────────────────────────────────────────────────────

await check("production is up and reports its commit", async () => {
  const res = await fetch(`${BASE}/health`);
  assert(res.status === 200, `status ${res.status}`);
  const body = await res.json();
  assert(body.status === "ok", `status field ${body.status}`);
  assert(body.mode === "production", `mode ${body.mode}`);
  return `commit ${body.commit || "unknown"}`;
});

await check("production rejects a forged order webhook", async () => {
  const res = await fetch(`${BASE}/webhooks/shopify/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1 }),
  });
  // 500 here means the deploy predates the Response re-throw fix.
  assert(res.status !== 500, "500, so this build is older than the webhook fix");
  assert(res.status === 401 || res.status === 400, `status ${res.status}`);
  return `status ${res.status}`;
});

console.log("");
if (failures.length > 0) {
  console.error(`${failures.length} check(s) FAILED: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("All post-rotation checks passed");

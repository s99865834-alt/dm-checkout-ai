/**
 * One-off debug: hit GET /me/conversations for a shop's Instagram token and
 * print Meta's raw response, to verify what the message-access probe sees.
 * Self-contained (plain Node can't resolve the app's extensionless imports).
 * Usage: node scripts/debug-message-access.mjs <shopId>
 */
import fs from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// Load .env (no dotenv dependency in this project)
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const keyString = process.env.ENCRYPTION_KEY_32B || "";
let key = Buffer.from(keyString, "base64");
if (key.length !== 32) key = Buffer.from(keyString, "utf8");

function decryptToken(token) {
  const raw = Buffer.from(token, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

const shopId = process.argv[2];
if (!shopId) {
  console.error("Usage: node scripts/debug-message-access.mjs <shopId>");
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: auth, error } = await supabase
  .from("meta_auth")
  .select("auth_type, ig_business_id, page_token_enc, token_expires_at")
  .eq("shop_id", shopId)
  .single();
if (error || !auth) {
  console.error("No meta_auth row:", error?.message);
  process.exit(1);
}

console.log("auth_type:", auth.auth_type, "| ig_business_id:", auth.ig_business_id, "| token_expires_at:", auth.token_expires_at);
const token = decryptToken(auth.page_token_enc);

const graphVersion = process.env.META_INSTAGRAM_API_VERSION || "v24.0";
const base = `https://graph.instagram.com/${graphVersion}`;

const res = await fetch(`${base}/me/conversations?limit=1`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log("GET /me/conversations -> HTTP", res.status);
console.log(JSON.stringify(await res.json(), null, 2));

/**
 * One-off backfill: encrypt the Shopify token columns already stored in
 * plain text on `Session`.
 *
 * Why:
 *   PrismaSessionStorage writes accessToken/refreshToken in the clear. After
 *   the Railway disclosure of 21 Oct 2026 those columns held live Admin API
 *   credentials for every installed shop. The Prisma extension in
 *   app/db.server.js encrypts everything written from now on; this handles the
 *   rows that predate it.
 *
 * Safe to run against production:
 *   - Dry run by default. Nothing is written without --apply.
 *   - Idempotent. Rows whose values no longer carry a Shopify prefix are
 *     already encrypted and are skipped, so re-runs are no-ops.
 *   - Writes go straight to Supabase rather than through Prisma, so the
 *     extension cannot double-encrypt.
 *
 * Order of operations:
 *   Deploy the app containing the Prisma extension FIRST, then run this.
 *   Running it before the deploy would leave the live app reading ciphertext
 *   it does not yet know how to decrypt.
 *
 * Usage:
 *   npx vite-node --config scripts/vite-node.config.mjs scripts/encrypt-session-tokens.mjs
 *   npx vite-node --config scripts/vite-node.config.mjs scripts/encrypt-session-tokens.mjs --apply
 */
import "dotenv/config";
import supabase from "../app/lib/supabase.server.js";
import { encryptToken } from "../app/lib/crypto.server.js";
import { SECRET_FIELDS, looksPlaintext } from "../app/lib/session-crypto.server.js";

const APPLY = process.argv.includes("--apply");

const { data: rows, error } = await supabase
  .from("Session")
  .select(`id, shop, ${SECRET_FIELDS.join(", ")}`);

if (error) {
  console.error("Could not read Session rows:", error.message);
  process.exit(1);
}

console.log(`${rows.length} session rows\n`);

const pending = [];
for (const row of rows) {
  const patch = {};
  for (const field of SECRET_FIELDS) {
    if (looksPlaintext(row[field])) patch[field] = encryptToken(row[field]);
  }
  if (Object.keys(patch).length > 0) pending.push({ row, patch });
}

const alreadyDone = rows.length - pending.length;
console.log(`  ${alreadyDone} already encrypted (or holding no token)`);
console.log(`  ${pending.length} to encrypt\n`);

if (pending.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

for (const { row, patch } of pending) {
  console.log(`  ${row.shop}: ${Object.keys(patch).join(", ")}`);
}

if (!APPLY) {
  console.log("\nDry run. Re-run with --apply to write.");
  process.exit(0);
}

console.log("\nApplying...");
let updated = 0;
let failed = 0;

for (const { row, patch } of pending) {
  const { error: updateError } = await supabase.from("Session").update(patch).eq("id", row.id);
  if (updateError) {
    failed += 1;
    console.error(`  FAIL ${row.shop}: ${updateError.message}`);
  } else {
    updated += 1;
    console.log(`  ok   ${row.shop}`);
  }
}

console.log(`\n${updated} updated, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

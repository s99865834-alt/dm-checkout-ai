/**
 * Re-encrypt every stored token from the old ENCRYPTION_KEY_32B to a new one.
 *
 * Why this needs a script:
 *   ENCRYPTION_KEY_32B is not a credential you can simply replace. It decrypts
 *   the Meta tokens in `meta_auth` and (since Oct 2026) the Shopify tokens on
 *   `Session`. Swapping it in Railway without re-encrypting makes every stored
 *   token unreadable the moment the service restarts, which disconnects every
 *   merchant and forces them to reconnect Instagram by hand.
 *
 * Zero-downtime procedure:
 *   1. Generate a new key:
 *        node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *   2. In Railway set ENCRYPTION_KEY_32B to the NEW key and
 *      ENCRYPTION_KEY_32B_OLD to the CURRENT one, then redeploy. The app now
 *      writes with the new key and can still read anything under the old one
 *      (see decryptToken in app/lib/crypto.server.js).
 *   3. Run this with --apply. Every row is rewritten under the new key.
 *   4. Confirm with a dry run that 0 rows remain, then remove
 *      ENCRYPTION_KEY_32B_OLD from Railway and redeploy.
 *
 * Skipping step 2 is the failure mode this script cannot save you from: with
 * only the new key present, the old ciphertext cannot be read at all.
 *
 * Safe to run against production:
 *   - Dry run by default. Nothing is written without --apply.
 *   - Idempotent. Rows that already decrypt under the current key are skipped,
 *     so an interrupted run can simply be repeated.
 *   - Decrypt and re-encrypt happen per row; a failure on one row leaves the
 *     others untouched and is reported rather than swallowed.
 *
 * Usage:
 *   npx vite-node --config scripts/vite-node.config.mjs scripts/rotate-encryption-key.mjs
 *   npx vite-node --config scripts/vite-node.config.mjs scripts/rotate-encryption-key.mjs --apply
 */
import "dotenv/config";
import supabase from "../app/lib/supabase.server.js";
import { encryptToken, decryptToken, isUnderCurrentKey } from "../app/lib/crypto.server.js";
import { SECRET_FIELDS, looksPlaintext } from "../app/lib/session-crypto.server.js";

const APPLY = process.argv.includes("--apply");

// Every table holding ciphertext, with the columns to rewrite.
const TARGETS = [
  {
    table: "meta_auth",
    idColumn: "id",
    label: (row) => row.shop_id,
    columns: ["user_token_enc", "page_token_enc", "ig_token_enc"],
  },
  {
    table: "Session",
    idColumn: "id",
    label: (row) => row.shop,
    columns: SECRET_FIELDS,
  },
];

if (!process.env.ENCRYPTION_KEY_32B_OLD) {
  console.warn(
    "ENCRYPTION_KEY_32B_OLD is not set. If the rotation has not happened yet this run will\n" +
    "find nothing to do, because everything already decrypts under the current key.\n"
  );
}

let totalPending = 0;
let totalUpdated = 0;
let totalFailed = 0;

for (const target of TARGETS) {
  const select = ["id", target.table === "Session" ? "shop" : "shop_id", ...target.columns].join(", ");
  const { data: rows, error } = await supabase.from(target.table).select(select);

  if (error) {
    console.error(`Could not read ${target.table}: ${error.message}`);
    totalFailed += 1;
    continue;
  }

  const pending = [];
  for (const row of rows) {
    const patch = {};
    for (const column of target.columns) {
      const value = row[column];
      if (typeof value !== "string" || value === "") continue;
      // Not encrypted at all: that is the other script's job, not this one.
      if (looksPlaintext(value)) continue;
      if (isUnderCurrentKey(value)) continue;
      patch[column] = value;
    }
    if (Object.keys(patch).length > 0) pending.push({ row, patch });
  }

  console.log(`${target.table}: ${rows.length} rows, ${pending.length} needing re-encryption`);
  totalPending += pending.length;

  for (const { row, patch } of pending) {
    console.log(`  ${target.label(row)}: ${Object.keys(patch).join(", ")}`);
  }

  if (!APPLY || pending.length === 0) continue;

  for (const { row, patch } of pending) {
    const rewritten = {};
    try {
      for (const [column, ciphertext] of Object.entries(patch)) {
        rewritten[column] = encryptToken(decryptToken(ciphertext));
      }
    } catch (err) {
      totalFailed += 1;
      console.error(
        `  FAIL ${target.label(row)}: could not decrypt under either key (${err?.message || err}). ` +
        `Is ENCRYPTION_KEY_32B_OLD correct?`
      );
      continue;
    }

    const { error: updateError } = await supabase
      .from(target.table)
      .update(rewritten)
      .eq(target.idColumn, row.id);

    if (updateError) {
      totalFailed += 1;
      console.error(`  FAIL ${target.label(row)}: ${updateError.message}`);
    } else {
      totalUpdated += 1;
      console.log(`  ok   ${target.label(row)}`);
    }
  }
}

console.log("");
if (!APPLY) {
  console.log(
    totalPending === 0
      ? "Nothing to re-encrypt. If you have just finished a rotation, it is safe to remove ENCRYPTION_KEY_32B_OLD."
      : `Dry run. Re-run with --apply to rewrite ${totalPending} row(s).`
  );
  process.exit(0);
}

console.log(`${totalUpdated} rows re-encrypted, ${totalFailed} failed`);
if (totalFailed === 0) {
  console.log("Re-run without --apply to confirm 0 remaining, then drop ENCRYPTION_KEY_32B_OLD.");
}
process.exit(totalFailed > 0 ? 1 : 0);

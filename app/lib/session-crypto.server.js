/**
 * Transparent encryption for the Shopify token columns on `Session`.
 *
 * PrismaSessionStorage writes `accessToken` and `refreshToken` as plain text.
 * That turns any database read into a full set of Admin API credentials for
 * every installed shop: on 23 Oct 2026 there were 37 sessions holding
 * read_orders on all of them, plus write_products on 6 and write_discounts on
 * 8, with refresh tokens valid until Jan 2027. Access tokens expire in an hour
 * under `future.expiringOfflineAccessTokens`, so the refresh token is the one
 * that actually matters.
 *
 * Applied through the Prisma extension in app/db.server.js so the session
 * library needs no changes.
 */
import { encryptToken, decryptToken } from "./crypto.server";

export const SECRET_FIELDS = ["accessToken", "refreshToken"];

// Shopify issues tokens with these prefixes. A stored value starting with one
// has not been encrypted yet, which is what makes this safe to deploy before
// the backfill runs and safe to re-run afterwards.
//
// Exported so tests can build fixtures from it. Writing a token-shaped literal
// into a test file trips GitHub push protection, even for an obviously fake one.
export const PLAINTEXT_PREFIXES = ["shpat_", "shpua_", "shpca_", "shprt_"];

/**
 * @param {unknown} value
 * @returns {boolean} true when this is a Shopify token still in the clear
 */
export function looksPlaintext(value) {
  return typeof value === "string" && PLAINTEXT_PREFIXES.some((p) => value.startsWith(p));
}

function encryptField(value) {
  // Prisma accepts `{ set: value }` for scalar updates; the session library
  // passes bare strings, but handling both keeps this correct if that changes.
  if (value && typeof value === "object" && typeof value.set === "string") {
    return { ...value, set: encryptField(value.set) };
  }
  if (typeof value !== "string" || value === "") return value;
  // Already ciphertext: re-encrypting would still decrypt correctly but would
  // churn the column on every write.
  return looksPlaintext(value) ? encryptToken(value) : value;
}

/**
 * Encrypt the token fields on a Prisma `data` payload, which may be one object
 * or an array of them.
 */
export function encryptSessionData(data) {
  if (Array.isArray(data)) return data.map(encryptSessionData);
  if (!data || typeof data !== "object") return data;

  let next = data;
  for (const field of SECRET_FIELDS) {
    if (!(field in next)) continue;
    const encrypted = encryptField(next[field]);
    if (encrypted !== next[field]) {
      if (next === data) next = { ...data };
      next[field] = encrypted;
    }
  }
  return next;
}

function decryptField(value, context) {
  if (typeof value !== "string" || value === "") return value;
  // Not yet backfilled. Pass it through so auth keeps working during rollout.
  if (looksPlaintext(value)) return value;
  try {
    return decryptToken(value);
  } catch (err) {
    // Returning the raw value makes the Admin API reject it and the merchant
    // re-auth, which is recoverable. Throwing here would break the page load.
    console.error(
      `[session-crypto] Could not decrypt ${context}; passing through so the shop can re-auth:`,
      err?.message || err,
    );
    return value;
  }
}

/**
 * Decrypt the token fields on a row or array of rows returned by Prisma.
 */
export function decryptSessionRow(row) {
  if (Array.isArray(row)) return row.map(decryptSessionRow);
  if (!row || typeof row !== "object") return row;

  let next = row;
  for (const field of SECRET_FIELDS) {
    if (typeof row[field] !== "string") continue;
    const plain = decryptField(row[field], `Session.${field} for ${row.shop || row.id || "unknown"}`);
    if (plain !== row[field]) {
      if (next === row) next = { ...row };
      next[field] = plain;
    }
  }
  return next;
}

// Which Prisma operations carry a writable `data` payload, and which return
// rows that need decrypting on the way back out.
const WRITE_OPERATIONS = new Set(["create", "createMany", "update", "updateMany", "upsert"]);
const READ_OPERATIONS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany"]);

/**
 * Rewrite the args of a Session write so tokens land encrypted.
 */
export function encryptSessionArgs(operation, args) {
  if (!WRITE_OPERATIONS.has(operation) || !args || typeof args !== "object") return args;

  const next = { ...args };
  let changed = false;

  if ("data" in next) {
    const data = encryptSessionData(next.data);
    if (data !== next.data) {
      next.data = data;
      changed = true;
    }
  }
  // upsert carries both branches.
  for (const branch of ["create", "update"]) {
    if (branch in next) {
      const value = encryptSessionData(next[branch]);
      if (value !== next[branch]) {
        next[branch] = value;
        changed = true;
      }
    }
  }

  return changed ? next : args;
}

/**
 * Decrypt whatever a Session read or write returned.
 */
export function decryptSessionResult(operation, result) {
  if (READ_OPERATIONS.has(operation) || WRITE_OPERATIONS.has(operation)) {
    return decryptSessionRow(result);
  }
  return result;
}

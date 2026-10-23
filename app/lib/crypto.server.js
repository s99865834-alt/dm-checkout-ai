import crypto from "crypto";

/**
 * Parse a 32-byte AES key from an env value, accepting base64 or raw UTF-8.
 *
 * @param {string} raw
 * @returns {Buffer|null} 32-byte key, or null when the value is absent/invalid
 */
function parseKey(raw) {
  const value = (raw || "").trim();
  if (!value) return null;

  let key;
  try {
    key = Buffer.from(value, "base64");
    if (key.length !== 32) {
      key = Buffer.from(value, "utf8");
    }
  } catch {
    key = Buffer.from(value, "utf8");
  }

  return key.length === 32 ? key : null;
}

const key = parseKey(process.env.ENCRYPTION_KEY_32B);

// Rotation support. Set ENCRYPTION_KEY_32B_OLD to the previous key while
// re-encrypting: decryption tries the current key first and falls back to the
// old one, so ciphertext written under either key stays readable and the
// rotation needs no downtime. Remove it once scripts/rotate-encryption-key.js
// reports every row re-encrypted.
const oldKey = parseKey(process.env.ENCRYPTION_KEY_32B_OLD);

if (!key) {
  const len = Buffer.from((process.env.ENCRYPTION_KEY_32B || "").trim(), "utf8").length;
  throw new Error(
    `ENCRYPTION_KEY_32B must be 32 bytes long. Current length: ${len}. ` +
    `Please set ENCRYPTION_KEY_32B in your .env file. ` +
    `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  );
}

if (process.env.ENCRYPTION_KEY_32B_OLD && !oldKey) {
  // Silently ignoring this would make a rotation look complete while the old
  // ciphertext was actually unreadable.
  throw new Error(
    "ENCRYPTION_KEY_32B_OLD is set but is not a valid 32-byte key. " +
    "Fix or unset it before deploying, otherwise rotation will fail to read existing rows."
  );
}

export function encryptToken(plain) {
  const iv = crypto.randomBytes(12); // GCM recommended IV size
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptWith(candidate, iv, tag, enc) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", candidate, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function decryptToken(token) {
  if (!token) {
    throw new Error("Cannot decrypt: token is null or undefined");
  }

  const raw = Buffer.from(token, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);

  try {
    return decryptWith(key, iv, tag, enc);
  } catch (err) {
    // GCM authentication fails on the wrong key, which is exactly what a
    // half-finished rotation looks like.
    if (oldKey) return decryptWith(oldKey, iv, tag, enc);
    throw err;
  }
}

/**
 * Whether `token` decrypts under the current key. Used by the rotation script
 * to tell re-encrypted rows from ones still on the old key, without writing.
 *
 * @param {string} token
 */
export function isUnderCurrentKey(token) {
  if (!token) return false;
  const raw = Buffer.from(token, "base64");
  try {
    decryptWith(key, raw.subarray(0, 12), raw.subarray(12, 28), raw.subarray(28));
    return true;
  } catch {
    return false;
  }
}

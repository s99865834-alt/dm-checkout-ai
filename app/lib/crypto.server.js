import crypto from "crypto";

// Read key from base64 (more secure) or fallback to UTF-8
const keyString = process.env.ENCRYPTION_KEY_32B || "";
let key;

// Try to decode as base64 first (if it's a base64 string)
try {
  key = Buffer.from(keyString, "base64");
  // If base64 decode results in exactly 32 bytes, use it
  if (key.length !== 32) {
    // Fallback to UTF-8 if base64 decode didn't give us 32 bytes
    key = Buffer.from(keyString, "utf8");
  }
} catch {
  // If base64 decode fails, try UTF-8
  key = Buffer.from(keyString, "utf8");
}

if (key.length !== 32) {
  throw new Error(
    `ENCRYPTION_KEY_32B must be 32 bytes long. Current length: ${key.length}. ` +
    `Please set ENCRYPTION_KEY_32B in your .env file. ` +
    `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  );
}

export function encryptToken(plain) {
  const iv = crypto.randomBytes(12); // GCM recommended IV size
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptToken(token) {
  const raw = Buffer.from(token, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}


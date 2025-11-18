import crypto from "crypto";

const key = Buffer.from(process.env.ENCRYPTION_KEY_32B || "", "utf8");
if (key.length !== 32) {
  throw new Error("ENCRYPTION_KEY_32B must be 32 bytes long");
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


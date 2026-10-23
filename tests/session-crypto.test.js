/**
 * Shopify tokens must never be written to `Session` in the clear, and must
 * come back out usable.
 *
 * 23 Oct 2026: 37 session rows held plaintext Admin API credentials, with
 * refresh tokens valid until Jan 2027. These assert the two halves that make
 * the fix safe to deploy ahead of the backfill: a plaintext value already in
 * the column still reads through untouched, and a value written today is
 * encrypted.
 */
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";

const KEY = crypto.randomBytes(32).toString("base64");
const OLD_KEY = crypto.randomBytes(32).toString("base64");

let sessionCrypto;
let cryptoServer;

beforeAll(async () => {
  process.env.ENCRYPTION_KEY_32B = KEY;
  delete process.env.ENCRYPTION_KEY_32B_OLD;
  cryptoServer = await import("../app/lib/crypto.server.js");
  sessionCrypto = await import("../app/lib/session-crypto.server.js");
});

// Built at runtime rather than written out: a token-shaped literal in a test
// file trips GitHub push protection even when the value is plainly fake.
const fakeToken = (prefix, fill) => `${prefix}${fill.repeat(32).slice(0, 32)}`;

let PLAIN_ACCESS;
let PLAIN_REFRESH;

beforeAll(() => {
  PLAIN_ACCESS = fakeToken(sessionCrypto.PLAINTEXT_PREFIXES[0], "a");
  PLAIN_REFRESH = fakeToken(sessionCrypto.PLAINTEXT_PREFIXES[3], "b");
});

describe("looksPlaintext", () => {
  it("recognises the Shopify token prefixes", () => {
    for (const prefix of sessionCrypto.PLAINTEXT_PREFIXES) {
      expect(sessionCrypto.looksPlaintext(fakeToken(prefix, "c"))).toBe(true);
    }
  });

  it("does not mistake ciphertext for a token", () => {
    expect(sessionCrypto.looksPlaintext(cryptoServer.encryptToken(PLAIN_ACCESS))).toBe(false);
  });

  it("is safe on null and non-strings", () => {
    expect(sessionCrypto.looksPlaintext(null)).toBe(false);
    expect(sessionCrypto.looksPlaintext(undefined)).toBe(false);
    expect(sessionCrypto.looksPlaintext(42)).toBe(false);
  });
});

describe("encryptSessionArgs", () => {
  it("encrypts both token fields on a create", () => {
    const args = sessionCrypto.encryptSessionArgs("create", {
      data: { shop: "a.myshopify.com", accessToken: PLAIN_ACCESS, refreshToken: PLAIN_REFRESH },
    });

    expect(args.data.accessToken).not.toBe(PLAIN_ACCESS);
    expect(args.data.refreshToken).not.toBe(PLAIN_REFRESH);
    expect(cryptoServer.decryptToken(args.data.accessToken)).toBe(PLAIN_ACCESS);
    expect(cryptoServer.decryptToken(args.data.refreshToken)).toBe(PLAIN_REFRESH);
    // Untouched fields survive.
    expect(args.data.shop).toBe("a.myshopify.com");
  });

  it("encrypts both branches of an upsert", () => {
    const args = sessionCrypto.encryptSessionArgs("upsert", {
      where: { id: "offline_a" },
      create: { shop: "a.myshopify.com", accessToken: PLAIN_ACCESS },
      update: { accessToken: PLAIN_ACCESS },
    });

    expect(cryptoServer.decryptToken(args.create.accessToken)).toBe(PLAIN_ACCESS);
    expect(cryptoServer.decryptToken(args.update.accessToken)).toBe(PLAIN_ACCESS);
  });

  it("does not re-encrypt a value that is already ciphertext", () => {
    const once = cryptoServer.encryptToken(PLAIN_ACCESS);
    const args = sessionCrypto.encryptSessionArgs("update", { data: { accessToken: once } });

    expect(args.data.accessToken).toBe(once);
    expect(cryptoServer.decryptToken(args.data.accessToken)).toBe(PLAIN_ACCESS);
  });

  it("leaves reads and deletes alone", () => {
    const readArgs = { where: { id: "offline_a" } };
    expect(sessionCrypto.encryptSessionArgs("findUnique", readArgs)).toBe(readArgs);
    expect(sessionCrypto.encryptSessionArgs("deleteMany", readArgs)).toBe(readArgs);
  });

  it("handles the { set } form Prisma allows for scalar updates", () => {
    const args = sessionCrypto.encryptSessionArgs("update", {
      data: { accessToken: { set: PLAIN_ACCESS } },
    });
    expect(cryptoServer.decryptToken(args.data.accessToken.set)).toBe(PLAIN_ACCESS);
  });
});

describe("decryptSessionResult", () => {
  it("returns a usable token to the session library", () => {
    const row = {
      shop: "a.myshopify.com",
      accessToken: cryptoServer.encryptToken(PLAIN_ACCESS),
      refreshToken: cryptoServer.encryptToken(PLAIN_REFRESH),
    };

    const out = sessionCrypto.decryptSessionResult("findUnique", row);

    expect(out.accessToken).toBe(PLAIN_ACCESS);
    expect(out.refreshToken).toBe(PLAIN_REFRESH);
  });

  it("passes plaintext straight through so auth works before the backfill", () => {
    const out = sessionCrypto.decryptSessionResult("findUnique", {
      shop: "a.myshopify.com",
      accessToken: PLAIN_ACCESS,
    });
    expect(out.accessToken).toBe(PLAIN_ACCESS);
  });

  it("decrypts every row of a findMany", () => {
    const rows = [
      { shop: "a", accessToken: cryptoServer.encryptToken(PLAIN_ACCESS) },
      { shop: "b", accessToken: PLAIN_ACCESS },
    ];
    const out = sessionCrypto.decryptSessionResult("findMany", rows);
    expect(out.map((r) => r.accessToken)).toEqual([PLAIN_ACCESS, PLAIN_ACCESS]);
  });

  it("survives null, which is what findUnique returns for a missing shop", () => {
    expect(sessionCrypto.decryptSessionResult("findUnique", null)).toBeNull();
  });

  it("does not throw when a value cannot be decrypted", () => {
    // A row encrypted under a key we no longer hold. Throwing here would break
    // the page load rather than letting the shop re-auth.
    const foreign = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const out = sessionCrypto.decryptSessionResult("findUnique", {
      shop: "a",
      accessToken: foreign,
    });
    expect(out.accessToken).toBe(foreign);
  });
});

describe("key rotation", () => {
  it("reads ciphertext written under the old key when both are set", async () => {
    // Encrypt under OLD_KEY, then load a fresh module instance where OLD_KEY
    // is the fallback, exactly as the app runs mid-rotation.
    process.env.ENCRYPTION_KEY_32B = OLD_KEY;
    delete process.env.ENCRYPTION_KEY_32B_OLD;
    const underOldKey = await import(`../app/lib/crypto.server.js?rotation=old`);
    const ciphertext = underOldKey.encryptToken(PLAIN_ACCESS);

    process.env.ENCRYPTION_KEY_32B = KEY;
    process.env.ENCRYPTION_KEY_32B_OLD = OLD_KEY;
    const rotating = await import(`../app/lib/crypto.server.js?rotation=both`);

    expect(rotating.decryptToken(ciphertext)).toBe(PLAIN_ACCESS);
    // And it can tell that this row still needs rewriting.
    expect(rotating.isUnderCurrentKey(ciphertext)).toBe(false);
    expect(rotating.isUnderCurrentKey(rotating.encryptToken(PLAIN_ACCESS))).toBe(true);

    process.env.ENCRYPTION_KEY_32B = KEY;
    delete process.env.ENCRYPTION_KEY_32B_OLD;
  });

  it("refuses to start when the old key is set but malformed", async () => {
    process.env.ENCRYPTION_KEY_32B = KEY;
    process.env.ENCRYPTION_KEY_32B_OLD = "too-short";
    await expect(import(`../app/lib/crypto.server.js?rotation=bad`)).rejects.toThrow(
      /ENCRYPTION_KEY_32B_OLD/
    );
    delete process.env.ENCRYPTION_KEY_32B_OLD;
  });
});

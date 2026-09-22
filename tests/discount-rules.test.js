/**
 * Rules behind single-use checkout discounts.
 *
 * Two of these matter more than the rest. toVariantKey is the join between a
 * pool and the reply that wants a code from it, and the two sides are written
 * by different code passing gids, bare numbers and numeric strings, so a
 * mismatch would leave pools that no reply can ever find. And the code format
 * is the only thing gating the discount, so a short or predictable code is a
 * discount anyone can brute force at checkout.
 */
import { describe, it, expect } from "vitest";
import {
  CODE_PREFIX,
  DISCOUNT_BUFFER_SIZE,
  appendDiscountLine,
  codesNeeded,
  discountOfferLine,
  discountTitle,
  generateDiscountCode,
  isValidDiscountPercentage,
  looksLikeOurDiscountCode,
  toVariantKey,
  MAX_DISCOUNT_PERCENTAGE,
  MIN_DISCOUNT_PERCENTAGE,
} from "../app/lib/discount-rules";

describe("generateDiscountCode", () => {
  it("produces a prefixed, fixed-length code", () => {
    const code = generateDiscountCode();
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    expect(code).toHaveLength(CODE_PREFIX.length + 10);
  });

  it("avoids characters that get misread when typed at checkout", () => {
    const body = Array.from({ length: 200 }, () => generateDiscountCode())
      .map((c) => c.slice(CODE_PREFIX.length))
      .join("");
    for (const ambiguous of ["0", "O", "1", "I", "L"]) {
      expect(body.includes(ambiguous)).toBe(false);
    }
  });

  it("does not repeat across a large batch", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateDiscountCode()));
    expect(codes.size).toBe(2000);
  });

  it("round-trips through its own shape check", () => {
    for (let i = 0; i < 50; i++) {
      expect(looksLikeOurDiscountCode(generateDiscountCode())).toBe(true);
    }
  });
});

describe("looksLikeOurDiscountCode", () => {
  it("rejects a merchant's own codes so we never try to attribute them", () => {
    // The order webhook runs this over every code on the order before hitting
    // the database. A false positive here is a pointless query; a false
    // negative is a lost attribution.
    expect(looksLikeOurDiscountCode("SUMMER20")).toBe(false);
    expect(looksLikeOurDiscountCode("BLACKFRIDAY")).toBe(false);
    expect(looksLikeOurDiscountCode("SR")).toBe(false);
    expect(looksLikeOurDiscountCode("SRABC")).toBe(false);
    expect(looksLikeOurDiscountCode("SRABCDEFGHIJKLMNOP")).toBe(false);
    // Right shape, but uses excluded characters.
    expect(looksLikeOurDiscountCode("SR0O1ILABCD")).toBe(false);
  });

  it("rejects non-strings", () => {
    for (const value of [null, undefined, 12345, {}, []]) {
      expect(looksLikeOurDiscountCode(value)).toBe(false);
    }
  });
});

describe("toVariantKey", () => {
  it("maps every form a caller might hold onto the same key", () => {
    const expected = "gid://shopify/ProductVariant/456";
    expect(toVariantKey("gid://shopify/ProductVariant/456")).toBe(expected);
    expect(toVariantKey("456")).toBe(expected);
    expect(toVariantKey(456)).toBe(expected);
    expect(toVariantKey(" 456 ")).toBe(expected);
  });

  it("leaves other gids untouched rather than mangling them", () => {
    expect(toVariantKey("gid://shopify/Product/456")).toBe("gid://shopify/Product/456");
  });

  it("returns null for anything with no id in it", () => {
    for (const value of [null, undefined, "", "   ", "abc"]) {
      expect(toVariantKey(value)).toBeNull();
    }
  });
});

describe("isValidDiscountPercentage", () => {
  it.each([MIN_DISCOUNT_PERCENTAGE, 5, 10, 25, MAX_DISCOUNT_PERCENTAGE])("accepts %i", (pct) => {
    expect(isValidDiscountPercentage(pct)).toBe(true);
  });

  it.each([0, -5, MAX_DISCOUNT_PERCENTAGE + 1, 100, 10.5, "10", null, undefined, NaN])(
    "rejects %s",
    (pct) => {
      expect(isValidDiscountPercentage(pct)).toBe(false);
    },
  );
});

describe("codesNeeded", () => {
  it("tops a pool back up to the buffer", () => {
    expect(codesNeeded(0)).toBe(DISCOUNT_BUFFER_SIZE);
    expect(codesNeeded(DISCOUNT_BUFFER_SIZE - 1)).toBe(1);
  });

  it("asks for nothing once the buffer is full or overfull", () => {
    expect(codesNeeded(DISCOUNT_BUFFER_SIZE)).toBe(0);
    expect(codesNeeded(DISCOUNT_BUFFER_SIZE + 10)).toBe(0);
  });

  it("treats a missing count as empty rather than as full", () => {
    // A failed count must mint codes, not silently starve the pool.
    expect(codesNeeded(undefined)).toBe(DISCOUNT_BUFFER_SIZE);
    expect(codesNeeded(null)).toBe(DISCOUNT_BUFFER_SIZE);
    expect(codesNeeded(-3)).toBe(DISCOUNT_BUFFER_SIZE);
  });
});

describe("appendDiscountLine", () => {
  const withCode = { discountCode: "SRABCDEFGHJ", discountPercentage: 10 };

  it("announces the discount when a code was actually attached", () => {
    const out = appendDiscountLine("Here's the link.", withCode, "Aries Nail Polish");
    expect(out).toContain("Here's the link.");
    expect(out).toContain("10%");
    expect(out).toContain("Aries Nail Polish");
  });

  it("says nothing when no code was claimed", () => {
    // The pool being empty is a normal outcome, not an error. The reply still
    // goes out, it just must not promise a discount that isn't in the link.
    const text = "Here's the link.";
    expect(appendDiscountLine(text, null, "Thing")).toBe(text);
    expect(appendDiscountLine(text, {}, "Thing")).toBe(text);
    expect(appendDiscountLine(text, { discountCode: "SRABCDEFGHJ" }, "Thing")).toBe(text);
    expect(appendDiscountLine(text, { discountPercentage: 10 }, "Thing")).toBe(text);
  });

  it("does not promise the discount twice", () => {
    const already = "Grab 10% off here: https://example.com";
    expect(appendDiscountLine(already, withCode, "Thing")).toBe(already);
  });

  it("drops the line rather than pushing a reply past Instagram's limit", () => {
    // Over 1000 characters Instagram rejects the send outright, so losing the
    // sentence is strictly better than losing the whole reply.
    const long = "x".repeat(980);
    expect(appendDiscountLine(long, withCode, "Aries Nail Polish")).toBe(long);
  });

  it("leaves an empty reply alone", () => {
    expect(appendDiscountLine("", withCode, "Thing")).toBe("");
    expect(appendDiscountLine(null, withCode, "Thing")).toBeNull();
  });

  it("never writes the code into the message", () => {
    // The code applies itself from the link. Printing it would add the manual
    // copy-paste step the product exists to remove.
    const out = appendDiscountLine("Here's the link.", withCode, "Aries Nail Polish");
    expect(out).not.toContain(withCode.discountCode);
    expect(looksLikeOurDiscountCode(out)).toBe(false);
  });
});

describe("copy", () => {
  it("names the product, because the discount only covers that one item", () => {
    const line = discountOfferLine(10, "Aries Nail Polish");
    expect(line).toContain("10%");
    expect(line).toContain("Aries Nail Polish");
  });

  it("still reads correctly with no product name", () => {
    const line = discountOfferLine(15, null);
    expect(line).toContain("15%");
    expect(line).not.toContain("undefined");
    expect(line).not.toContain("null");
  });

  it("labels the discount in the merchant's admin so it is recognisable", () => {
    expect(discountTitle(10, "Aries Nail Polish")).toBe(
      "SocialRepl.ai 10% off Aries Nail Polish",
    );
    expect(discountTitle(10, null)).toBe("SocialRepl.ai 10% off");
  });

  it("states the offer without exposing a code", () => {
    const line = discountOfferLine(10, "Aries Nail Polish");
    expect(line).toContain("10%");
    expect(line).toContain("Aries Nail Polish");
    expect(line).not.toContain(CODE_PREFIX);
    expect(line).not.toContain("undefined");
  });
});

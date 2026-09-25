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
  describeOffer,
  isValidDiscountOffer,
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
  const pct = {
    discountCode: "SRABCDEFGHJ",
    discountType: "percentage",
    discountValue: 10,
    discountCurrency: "USD",
  };
  const amount = {
    discountCode: "SRABCDEFGHJ",
    discountType: "amount",
    discountValue: 5,
    discountCurrency: "USD",
  };

  it("announces a percentage discount", () => {
    const out = appendDiscountLine("Here's the link.", pct, "Aries Nail Polish");
    expect(out).toContain("Here's the link.");
    expect(out).toContain("10% off");
    expect(out).toContain("Aries Nail Polish");
  });

  it("keeps the discount sentence in the same language as the reply", () => {
    const out = appendDiscountLine("Puedes pedirlo aquí.", pct, "The Collection Snowboard: Liquid", "es");
    expect(out).toContain("Puedes pedirlo aquí.");
    expect(out).toContain("10% de descuento");
    expect(out).not.toMatch(/I've added/);
  });

  it("announces a fixed amount in the shop's currency", () => {
    const out = appendDiscountLine("Here's the link.", amount, "Aries Nail Polish");
    expect(out).toContain("$5 off");
  });

  it("uses the shop's currency rather than assuming dollars", () => {
    const gbp = { ...amount, discountCurrency: "GBP" };
    expect(appendDiscountLine("Here's the link.", gbp, "Thing")).toContain("£5");
  });

  it("says nothing when no code was claimed", () => {
    // An empty pool is a normal outcome. The reply still goes out, it just
    // must not promise a discount that is not in the link.
    const text = "Here's the link.";
    expect(appendDiscountLine(text, null, "Thing")).toBe(text);
    expect(appendDiscountLine(text, {}, "Thing")).toBe(text);
    expect(appendDiscountLine(text, { discountCode: "SRABCDEFGHJ" }, "Thing")).toBe(text);
  });

  it("does not promise the discount twice", () => {
    const already = "Grab 10% off here: https://example.com";
    expect(appendDiscountLine(already, pct, "Thing")).toBe(already);
  });

  it("drops the line rather than pushing a reply past Instagram's limit", () => {
    const long = "x".repeat(980);
    expect(appendDiscountLine(long, pct, "Aries Nail Polish")).toBe(long);
  });

  it("leaves an empty reply alone", () => {
    expect(appendDiscountLine("", pct, "Thing")).toBe("");
    expect(appendDiscountLine(null, pct, "Thing")).toBeNull();
  });

  it("never writes the code into the message", () => {
    // The code applies itself from the link. Printing it would add the manual
    // copy-paste step the product exists to remove.
    const out = appendDiscountLine("Here's the link.", pct, "Aries Nail Polish");
    expect(out).not.toContain(pct.discountCode);
    expect(looksLikeOurDiscountCode(out)).toBe(false);
  });
});

describe("describeOffer", () => {
  it("renders both kinds of offer", () => {
    expect(describeOffer("percentage", 20, "USD")).toBe("20% off");
    expect(describeOffer("amount", 5, "USD")).toBe("$5 off");
    expect(describeOffer("amount", 7.5, "USD")).toBe("$7.50 off");
  });

  it("falls back to the code for a currency Intl cannot format", () => {
    expect(describeOffer("amount", 5, "NOTREAL")).toContain("5");
  });
});

describe("isValidDiscountOffer", () => {
  it("accepts sensible offers of both kinds", () => {
    expect(isValidDiscountOffer("percentage", 20)).toBe(true);
    expect(isValidDiscountOffer("amount", 5)).toBe(true);
    expect(isValidDiscountOffer("amount", 7.5)).toBe(true);
  });

  it("caps percentages at 50, where a bigger number is likelier a typo", () => {
    expect(isValidDiscountOffer("percentage", 51)).toBe(false);
    expect(isValidDiscountOffer("percentage", 100)).toBe(false);
  });

  it("requires whole-number percentages but allows cents on amounts", () => {
    expect(isValidDiscountOffer("percentage", 10.5)).toBe(false);
    expect(isValidDiscountOffer("amount", 10.5)).toBe(true);
  });

  it("rejects nonsense", () => {
    expect(isValidDiscountOffer("amount", 0)).toBe(false);
    expect(isValidDiscountOffer("amount", -5)).toBe(false);
    expect(isValidDiscountOffer("freeshipping", 5)).toBe(false);
    expect(isValidDiscountOffer("percentage", "20")).toBe(false);
    expect(isValidDiscountOffer("percentage", NaN)).toBe(false);
  });
});

describe("copy", () => {
  it("names the product, because the discount only covers that one item", () => {
    const line = discountOfferLine("percentage", 10, "USD", "Aries Nail Polish");
    expect(line).toContain("10% off");
    expect(line).toContain("Aries Nail Polish");
  });

  it("still reads correctly with no product name", () => {
    const line = discountOfferLine("percentage", 15, "USD", null);
    expect(line).toContain("15% off");
    expect(line).not.toContain("undefined");
    expect(line).not.toContain("null");
  });

  it("labels the discount in the merchant's admin so it is recognisable", () => {
    expect(discountTitle("percentage", 10, "USD", "Aries Nail Polish")).toBe(
      "SocialRepl.ai 10% off Aries Nail Polish",
    );
    expect(discountTitle("amount", 5, "USD", null)).toBe("SocialRepl.ai $5 off");
  });

  it("states the offer without exposing a code", () => {
    const line = discountOfferLine("percentage", 10, "USD", "Aries Nail Polish");
    expect(line).not.toContain(CODE_PREFIX);
    expect(line).not.toContain("undefined");
  });
});

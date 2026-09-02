/**
 * When we ask a customer which one they want, their answer has to produce a
 * checkout link.
 *
 * The case these were written from, Sep 1 on the Pro test store: we replied
 * "The Complete Snowboard ... comes in Ice, Dawn, Powder, Electric, and Sunset
 * colors. Which color do you want? I'll send you a checkout link as soon as
 * you pick!" and the customer said "Love the sunset!". They got nothing. The
 * classifier is instructed to judge messages in isolation (so it stops
 * carrying stale products between turns) and scored it not_relevant with 0.9
 * confidence, and the deterministic fallback looked for the word "color"
 * rather than for a colour.
 *
 * The option values below are the real ones from that product.
 */
import { describe, it, expect } from "vitest";
import {
  resolveVariantByOptionValue,
  askedCustomerToChoose,
} from "../app/lib/shopify-data.server";

const variant = (id, opts, availableForSale = true) => ({
  id,
  availableForSale,
  selectedOptions: Object.entries(opts).map(([name, value]) => ({ name, value })),
});

const SNOWBOARD = {
  options: [{ name: "Color", values: ["Ice", "Dawn", "Powder", "Electric", "Sunset"] }],
  variants: [
    variant("gid://shopify/ProductVariant/1", { Color: "Ice" }),
    variant("gid://shopify/ProductVariant/2", { Color: "Dawn" }),
    variant("gid://shopify/ProductVariant/3", { Color: "Powder" }),
    variant("gid://shopify/ProductVariant/4", { Color: "Electric" }),
    variant("gid://shopify/ProductVariant/5", { Color: "Sunset" }),
  ],
};

const TEE = {
  options: [
    { name: "Color", values: ["Ice", "Sunset"] },
    { name: "Size", values: ["S", "M", "L"] },
  ],
  variants: [
    variant("ice-s", { Color: "Ice", Size: "S" }),
    variant("ice-m", { Color: "Ice", Size: "M" }),
    variant("sunset-s", { Color: "Sunset", Size: "S" }),
    variant("sunset-m", { Color: "Sunset", Size: "M" }),
  ],
};

describe("resolveVariantByOptionValue", () => {
  it("resolves the colour the customer picked", () => {
    const res = resolveVariantByOptionValue(SNOWBOARD, "Love the sunset!");
    expect(res.variant.id).toBe("gid://shopify/ProductVariant/5");
    expect(res.chosen).toEqual([{ name: "Color", value: "Sunset" }]);
  });

  it.each([
    ["i'll take the electric one", "gid://shopify/ProductVariant/4"],
    ["Powder please", "gid://shopify/ProductVariant/3"],
    ["DAWN", "gid://shopify/ProductVariant/2"],
    ["ice pls", "gid://shopify/ProductVariant/1"],
  ])("resolves %s", (text, expected) => {
    expect(resolveVariantByOptionValue(SNOWBOARD, text).variant.id).toBe(expected);
  });

  // "Ice" inside "price", "nice" and "service" is the reason this matches on
  // word boundaries. Without it, "what's the price?" would check a customer
  // out into a colour they never picked.
  it.each(["what's the price?", "that's so nice", "how is your service", "is it iced?"])(
    "does not match a value buried inside another word: %s",
    (text) => {
      expect(resolveVariantByOptionValue(SNOWBOARD, text)).toBeNull();
    }
  );

  it("returns null when nothing matches", () => {
    expect(resolveVariantByOptionValue(SNOWBOARD, "do you ship to canada?")).toBeNull();
  });

  it("reports ambiguity instead of guessing between two colours", () => {
    const res = resolveVariantByOptionValue(SNOWBOARD, "sunset or powder?");
    expect(res.ambiguous).toBe(true);
    expect(res.values.sort()).toEqual(["Powder", "Sunset"]);
  });

  it("keeps the size they already had when they only name a colour", () => {
    const res = resolveVariantByOptionValue(TEE, "the sunset one", "ice-m");
    expect(res.variant.id).toBe("sunset-m");
  });

  it("combines values when they name both options", () => {
    const res = resolveVariantByOptionValue(TEE, "sunset in a small please", "ice-m");
    expect(res.variant.id).toBe("sunset-s");
  });

  it("prefers an in-stock variant", () => {
    const soldOut = {
      options: [{ name: "Color", values: ["Sunset"] }],
      variants: [variant("out", { Color: "Sunset" }, false), variant("in", { Color: "Sunset" })],
    };
    expect(resolveVariantByOptionValue(soldOut, "sunset").variant.id).toBe("in");
  });

  it("ignores placeholder option values", () => {
    const single = {
      options: [{ name: "Title", values: ["Default Title"] }],
      variants: [variant("only", { Title: "Default Title" })],
    };
    expect(resolveVariantByOptionValue(single, "default title")).toBeNull();
  });

  it("handles a values-shaped variants object", () => {
    const nested = { options: SNOWBOARD.options, variants: { nodes: SNOWBOARD.variants } };
    expect(resolveVariantByOptionValue(nested, "sunset").variant.id).toBe(
      "gid://shopify/ProductVariant/5"
    );
  });

  it.each([null, undefined, "", "   "])("returns null for %s text", (text) => {
    expect(resolveVariantByOptionValue(SNOWBOARD, text)).toBeNull();
  });

  it("returns null without options or variants", () => {
    expect(resolveVariantByOptionValue(null, "sunset")).toBeNull();
    expect(resolveVariantByOptionValue({ options: [], variants: [] }, "sunset")).toBeNull();
  });
});

describe("askedCustomerToChoose", () => {
  // The exact reply that went out before the dropped message.
  it("recognises the reply that preceded the failure", () => {
    expect(
      askedCustomerToChoose(
        "So glad you love it! The Complete Snowboard is available for $699.95 and comes in Ice, Dawn, Powder, Electric, and Sunset colors. Which color do you want? I’ll send you a checkout link as soon as you pick!"
      )
    ).toBe(true);
  });

  it.each([
    "Which size would you like?",
    "What colour do you want?",
    "Let me know which one you'd like and I'll send the link!",
    "Which one do you prefer?",
  ])("recognises %s", (text) => {
    expect(askedCustomerToChoose(text)).toBe(true);
  });

  it.each([
    "Here's your checkout link: https://example.com/cart/1:1",
    "Thanks for the shoutout!",
    "We ship worldwide in 3-5 days.",
    "Anything else I can help with?",
    "",
    null,
  ])("does not fire on %s", (text) => {
    expect(askedCustomerToChoose(text)).toBe(false);
  });
});

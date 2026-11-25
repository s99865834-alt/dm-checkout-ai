/**
 * Prices in AI replies are checked against the prices the app gave the model.
 *
 * The two replies below went out to real customers in Nov 2026. The catalog
 * search passed prices in minor units and the model read them as major ones:
 * Shane's eCares quoted a $15.00 jar at $1,500, and Tabcase quoted a 7.500
 * OMR case at 75 OMR. Tabcase switched replies off the next day.
 */
import { describe, it, expect } from "vitest";
import {
  findPriceMentions,
  createPriceBook,
  addPrice,
  addPricesFromText,
  addDiscount,
  unverifiedPrices,
  enforcePrices,
  hasWords,
  describePrices,
  withCurrency,
} from "../app/lib/price-guard";

const TABCASE_REPLY =
  "متوفر عندنا كفرات فاخرة تناسب آيباد برو 12.9، مثل Design 24 و Design 32 وكل واحد بسعر 75 ر.ع. تقدر تطلب من الروابط:\nhttps://c3w5hj-y9.myshopify.com/a/go/c5UbZhpT\nأو\nhttps://c3w5hj-y9.myshopify.com/a/go/ehW3nC3W\n\nأو إذا تفضل، أرسل لي رقم جوالك وموقعك واسم الكفر اللي عجبك هنا في الدايركت وفريقنا بيتواصل معك لتأكيد الطلب. التوصيل لعمان للبيت 2 ر.ع، وللمكتب 1 ر.ع، وللإمارات 4 ر.ع.";
const TABCASE_INSTRUCTION = "- التوصيل: عمان للبيت 2 ر.ع، عمان للمكتب 1 ر.ع، الإمارات 4 ر.ع.";

const SHANES_REPLY =
  "Both the Mango Flavored Seamoss and Pineapple Seamoss are $1,500 each, but it looks like they're not available right now. You can check out the rest of the store's catalog here: https://shanesecaresllc.myshopify.com/a/go/5BSvWaFc and here: https://shanesecaresllc.myshopify.com/a/go/t62Fx31B. Let me know if you want help finding something else!";

function tabcaseBook() {
  const book = createPriceBook();
  addPrice(book, "7.500 OMR", { label: "iPad Case – Design 24" });
  addPrice(book, "7.500 OMR", { label: "iPad Case – Design 32" });
  addPrice(book, "8.500 OMR", { label: "iPad Case – Design 56" });
  addPrice(book, "5.900 OMR", { label: "iPad Case – Design 3" });
  addPricesFromText(book, TABCASE_INSTRUCTION);
  return book;
}

function shanesBook() {
  const book = createPriceBook();
  addPrice(book, "15.00 USD", { label: "Seamoss (Mango Flavored)" });
  addPrice(book, "25.00 USD", { label: "Seamoss (Mango Flavored) 16oz" });
  addPrice(book, "34.99 USD", { label: "EFX Sea Moss Gummies" });
  return book;
}

describe("the two replies that went out wrong", () => {
  it("corrects Tabcase's 75 OMR to the real 7.500 and keeps the delivery fees", () => {
    const { text, corrected, removed } = enforcePrices(TABCASE_REPLY, tabcaseBook());
    expect(text).toContain("بسعر 7.500 ر.ع");
    expect(text).not.toMatch(/(?<![\d.])75 ر\.ع/);
    expect(corrected).toEqual([{ from: "75 ر.ع", to: "7.500" }]);
    expect(removed).toEqual([]);
    expect(text).toContain("للبيت 2 ر.ع");
    expect(text).toContain("https://c3w5hj-y9.myshopify.com/a/go/c5UbZhpT");
  });

  it("corrects Shane's $1,500 to the real $15.00", () => {
    const { text, corrected } = enforcePrices(SHANES_REPLY, shanesBook());
    expect(text).toContain("are $15.00 each");
    expect(text).not.toContain("1,500");
    expect(corrected).toHaveLength(1);
    expect(text).toContain("https://shanesecaresllc.myshopify.com/a/go/t62Fx31B");
  });

  it("flags both before correction", () => {
    expect(unverifiedPrices(TABCASE_REPLY, tabcaseBook()).map((m) => m.raw)).toEqual(["75 ر.ع"]);
    expect(unverifiedPrices(SHANES_REPLY, shanesBook()).map((m) => m.raw)).toEqual(["$1,500"]);
  });
});

describe("findPriceMentions", () => {
  it.each([
    ["Design 24 is 7.5 OMR", "7.5 OMR"],
    ["OMR 7.500 for the case", "OMR 7.500"],
    ["كل واحد بسعر 7.5 ر.ع", "7.5 ر.ع"],
    ["السعر 7.500 ريال", "7.500 ريال"],
    ["It's $34.99", "$34.99"],
    ["only 15$", "15$"],
    ["€ 15,00", "€ 15,00"],
    ["Rs. 1,499 only", "Rs. 1,499"],
    ["15 dollars", "15 dollars"],
    ["The price is 75", "75"],
    ["السعر 75", "75"],
  ])("finds the price in %s", (text, raw) => {
    expect(findPriceMentions(text).map((m) => m.raw)).toEqual([raw]);
  });

  it("reads Arabic-Indic digits", () => {
    const [m] = findPriceMentions("السعر ٧٫٥ ر.ع");
    expect(m.values).toEqual([7.5]);
  });

  it("keeps both readings of an ambiguous number", () => {
    expect(findPriceMentions("$1,500")[0].values).toEqual([1500, 1.5]);
    expect(findPriceMentions("7.500 OMR")[0].values).toEqual([7.5, 7500]);
    expect(findPriceMentions("15.00 USD")[0].values).toEqual([15]);
  });

  it("reads small units as fractions", () => {
    expect(findPriceMentions("just 99 cents")[0].values).toContain(0.99);
  });

  it("treats the bare end of a range as a price", () => {
    expect(findPriceMentions("from 5.9 to 8.5 OMR").map((m) => m.raw)).toEqual(["5.9", "8.5 OMR"]);
    expect(findPriceMentions("$15-25").map((m) => m.raw)).toEqual(["$15", "25"]);
  });

  it.each([
    "We have it for the iPad Pro 12.9 and the iPad 10",
    "Is your iPad an A16 or the M1 model?",
    "Design 24 and Design 32 both fit",
    "Delivery takes 2-3 days",
    "shipping costs 2-3 days to arrive",
    "It fits the 11 inch model",
    "10% off is already in your link",
    "Only 3 left in stock!",
    "Your order #1001 has shipped",
    "Call us on 9123 4567",
    "ALL 3 colours are back",
    "It comes with a 6 Ft cable",
    "Here you go: https://store.myshopify.com/a/go/AB12CD34?variant=4567",
  ])("finds no price in %s", (text) => {
    expect(findPriceMentions(text, "USD")).toEqual([]);
  });
});

describe("unverifiedPrices", () => {
  it.each([
    "Design 24 is 7.5 OMR",
    "Design 24 is 7.500 ر.ع",
    "Design 24 is 7,500 OMR",
    "كل واحد بسعر 7.5 ريال",
    "Both together are 15 OMR",
    "Delivery to the UAE is 4 ر.ع",
  ])("accepts %s for Tabcase", (text) => {
    expect(unverifiedPrices(text, tabcaseBook())).toEqual([]);
  });

  it.each([
    "Design 24 is 75 OMR",
    "Design 24 is 7500 OMR",
    "Design 24 is 7.5$",
    "Design 24 is 9 OMR",
  ])("rejects %s for Tabcase", (text) => {
    expect(unverifiedPrices(text, tabcaseBook())).toHaveLength(1);
  });

  it.each(["It's $15", "It's $15.00", "Three jars are $45", "The gummies are $34.99"])(
    "accepts %s for Shane's",
    (text) => {
      expect(unverifiedPrices(text, shanesBook())).toEqual([]);
    }
  );

  it.each(["It's $1,500", "It's $150", "The gummies are $35", "It's €15"])("rejects %s for Shane's", (text) => {
    expect(unverifiedPrices(text, shanesBook())).toHaveLength(1);
  });

  it("accepts a total only when the sentence says how many", () => {
    expect(unverifiedPrices("Three jars are $45", shanesBook())).toEqual([]);
    expect(unverifiedPrices("Grab 3 jars for $45", shanesBook())).toEqual([]);
    expect(unverifiedPrices("Both together are 15 OMR", tabcaseBook())).toEqual([]);
    expect(unverifiedPrices("الاثنين بسعر 15 ر.ع", tabcaseBook())).toEqual([]);
    expect(unverifiedPrices("It's $45", shanesBook())).toHaveLength(1);
  });

  it("does not take a model number for a quantity", () => {
    expect(unverifiedPrices("Our iPad 10 cases are 75 OMR", tabcaseBook())).toHaveLength(1);
    expect(unverifiedPrices("Design 24 fits and it is 75 OMR", tabcaseBook())).toHaveLength(1);
  });

  it("never multiplies a delivery fee into a product price", () => {
    expect(unverifiedPrices("Design 24 is 9 OMR", tabcaseBook())).toHaveLength(1);
  });

  it("accepts the discounted price the link carries", () => {
    const pct = addDiscount(shanesBook(), { type: "percentage", value: 10 });
    expect(unverifiedPrices("With 10% off it's $13.50", pct)).toEqual([]);
    const off = addDiscount(shanesBook(), { type: "amount", value: 5 });
    expect(unverifiedPrices("$5 off, so it's $10", off)).toEqual([]);
  });

  it("accepts prices the store's own text states", () => {
    const book = addPricesFromText(shanesBook(), "Free shipping on orders over $50. 3 for $60 on all jars.");
    expect(unverifiedPrices("Orders over $50 ship free, or grab 3 for $60", book)).toEqual([]);
  });

  it("rejects every price when the model was given none", () => {
    expect(unverifiedPrices("It's only $20!", createPriceBook())).toHaveLength(1);
  });
});

describe("enforcePrices", () => {
  it("leaves a reply with correct prices untouched", () => {
    const reply = "Design 24 is 7.500 OMR. Order here: https://c3w5hj-y9.myshopify.com/a/go/abc";
    expect(enforcePrices(reply, tabcaseBook())).toEqual({ text: reply, corrected: [], removed: [] });
  });

  it("removes a price it cannot place, with its sentence, and keeps the link", () => {
    const reply = "Love that one! It's $20 here: https://shanesecaresllc.myshopify.com/a/go/X1. Want the 16oz too?";
    const { text, removed } = enforcePrices(reply, shanesBook());
    expect(removed).toEqual(["$20"]);
    expect(text).not.toContain("$20");
    expect(text).toContain("Love that one!");
    expect(text).toContain("Want the 16oz too?");
    expect(text).toContain("https://shanesecaresllc.myshopify.com/a/go/X1");
  });

  it("removes a price quoted in the wrong currency", () => {
    const { text, removed } = enforcePrices("Design 24 is $7.5. Want it?", tabcaseBook());
    expect(removed).toEqual(["$7.5"]);
    expect(text).toBe("Want it?");
  });

  it("corrects a misread total to the total, not the unit price", () => {
    const { text } = enforcePrices("Three jars are $450.", shanesBook());
    expect(text).toBe("Three jars are $45.00.");
  });

  it("removes a misread total that could be either the unit price or the total", () => {
    // $1,500 for ten jars is $15.00 misread twice or $150.00 misread once.
    const { text, corrected } = enforcePrices("Ten jars are $1,500. Want them?", shanesBook());
    expect(corrected).toEqual([]);
    expect(text).toBe("Want them?");
  });

  it("corrects the Tabcase shape even next to a model number", () => {
    const { text } = enforcePrices("Our iPad 10 cases are 75 OMR.", tabcaseBook());
    expect(text).toBe("Our iPad 10 cases are 7.500 OMR.");
  });

  it("does not guess between two prices a power of ten apart", () => {
    const book = createPriceBook();
    addPrice(book, "15.00 USD");
    addPrice(book, "150.00 USD");
    const { text, corrected, removed } = enforcePrices("It's $1,500. Want it?", book);
    expect(corrected).toEqual([]);
    expect(removed).toEqual(["$1,500"]);
    expect(text).toBe("Want it?");
  });

  it("can leave nothing worth sending", () => {
    const { text } = enforcePrices("It's only $20!", createPriceBook());
    expect(hasWords(text)).toBe(false);
  });
});

describe("helpers", () => {
  it("labels a bare amount with its currency", () => {
    expect(withCurrency("7.500", "OMR")).toBe("7.500 OMR");
    expect(withCurrency("7.500 OMR", "OMR")).toBe("7.500 OMR");
    expect(withCurrency("7.500", null)).toBe("7.500");
    expect(withCurrency(null, "OMR")).toBeNull();
  });

  it("describes the known prices for a corrective prompt", () => {
    expect(describePrices(tabcaseBook())).toContain("iPad Case – Design 24: 7.500 OMR");
  });
});

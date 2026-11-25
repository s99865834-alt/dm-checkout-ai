import { describe, it, expect } from "vitest";
import {
  detectLanguage,
  detectMessageLanguage,
  hasWords,
  languageInstructionText,
  normalizeStoreLocale,
  replyLanguageMismatch,
  resolveReplyLanguage,
} from "../app/lib/reply-language";

// State of Her is an Egyptian store. These are her customers' real first DMs,
// every one of which was answered in English while the prompt told the model
// in capitals not to use any language other than English.
const ARABIC = [
  "مساء الخير",
  "فى استيدال واسترجاع",
  "طيب انا مش عارفه احدد المقاسات الصراحه",
  "انا بلبس فى العادى ٣٦",
  "بس مش عايزاه يبقى ضيق وبرضه مش واسع",
];

describe("detectMessageLanguage", () => {
  it("does not treat hearts or emoji as a language", () => {
    expect(detectMessageLanguage("❤️❤️❤️❤️")).toBeNull();
    expect(detectMessageLanguage("🔥🔥")).toBeNull();
    expect(detectMessageLanguage("😍")).toBeNull();
  });

  it("does not guess from a short or empty message", () => {
    expect(detectMessageLanguage("")).toBeNull();
    expect(detectMessageLanguage("si")).toBeNull();
    expect(detectMessageLanguage("ok")).toBeNull();
  });

  it("detects English comments", () => {
    expect(detectMessageLanguage("Love these products")).toBe("en");
    expect(detectMessageLanguage("Need this!")).toBe("en");
    expect(detectMessageLanguage("This is amazing")).toBe("en");
  });

  it("detects Spanish, Portuguese, and French when the customer actually wrote them", () => {
    expect(detectMessageLanguage("Gracias por tanto amor")).toBe("es");
    expect(detectMessageLanguage("Quiero este por favor")).toBe("es");
    expect(detectMessageLanguage("Obrigado, eu quero isso")).toBe("pt-BR");
    expect(detectMessageLanguage("Merci beaucoup pour ça")).toBe("fr");
  });
});

describe("resolveReplyLanguage", () => {
  it("defaults hearts to English on an English store", () => {
    const resolved = resolveReplyLanguage({
      setting: "auto",
      messageText: "❤️❤️❤️❤️",
      storeLocale: "en",
    });
    expect(resolved).toEqual({ code: "en", name: "English", source: "default" });
  });

  it("uses the store language when the comment has no language of its own", () => {
    const resolved = resolveReplyLanguage({
      setting: "auto",
      messageText: "❤️❤️❤️❤️",
      storeLocale: "es-MX",
    });
    expect(resolved).toEqual({ code: "es", name: "Spanish", source: "store" });
  });

  it("follows a Spanish comment even when the store is English", () => {
    const resolved = resolveReplyLanguage({
      setting: "auto",
      messageText: "Hola, quiero este por favor",
      storeLocale: "en",
    });
    expect(resolved.code).toBe("es");
    expect(resolved.source).toBe("customer");
  });

  it("honors a forced merchant setting over the comment", () => {
    const resolved = resolveReplyLanguage({
      setting: "es",
      messageText: "Love these products",
      storeLocale: "en",
    });
    expect(resolved).toEqual({ code: "es", name: "Spanish", source: "forced" });
  });
});

describe("hasWords", () => {
  it("sees words in scripts the tokenizer cannot read", () => {
    for (const text of ARABIC) expect(hasWords(text)).toBe(true);
    expect(hasWords("こんにちは")).toBe(true);
    expect(hasWords("Γεια σας")).toBe(true);
    expect(hasWords("Привет")).toBe(true);
    expect(hasWords("merhaba, bu elbise ne kadar")).toBe(true);
  });

  // The noise cases are what the forced-English default exists for, so each
  // one has to keep reading as "no words".
  it("does not count emoji, punctuation or digits as words", () => {
    expect(hasWords("❤️❤️❤️❤️")).toBe(false);
    expect(hasWords("🔥🔥")).toBe(false);
    expect(hasWords("!!!")).toBe(false);
    expect(hasWords("36")).toBe(false);
    expect(hasWords("٣٦")).toBe(false);
    expect(hasWords("")).toBe(false);
    expect(hasWords(null)).toBe(false);
  });

  it("ignores links, handles and hashtags, which say nothing about language", () => {
    expect(hasWords("https://stateofher.co/products/wide-leg-greige-pleated-pants")).toBe(false);
    expect(hasWords("@someone")).toBe(false);
    expect(hasWords("#sale #shop")).toBe(false);
  });
});

describe("languages read from their script", () => {
  it("names Arabic for every one of State of Her's real Arabic DMs", () => {
    for (const text of ARABIC) {
      expect(resolveReplyLanguage({ setting: "auto", messageText: text })).toMatchObject({
        code: "ar",
        name: "Arabic",
        source: "customer",
      });
    }
  });

  it.each([
    ["این چقدر است؟", "fa"],
    ["یہ کتنے کا ہے؟", "ur"],
    ["שלום, כמה זה עולה?", "he"],
    ["Скільки коштує?", "uk"],
    ["Γεια σας, πόσο κοστίζει", "el"],
    ["こんにちは、これはいくらですか", "ja"],
    ["这个多少钱", "zh"],
    ["얼마예요?", "ko"],
  ])("names the language of %s", (text, code) => {
    expect(detectLanguage(text).code).toBe(code);
  });

  it("names only the script when it carries several languages", () => {
    expect(detectLanguage("Сколько стоит?")).toEqual({ code: null, name: null, script: "Cyrillic" });
    const resolved = resolveReplyLanguage({ setting: "auto", messageText: "कितने का है?" });
    expect(resolved.source).toBe("script");
    expect(languageInstructionText(resolved)).toMatch(/Devanagari script/);
  });

  it("reads Arabic with product names in it as Arabic", () => {
    expect(detectLanguage("عندكم كفر iPad Pro 12.9؟").code).toBe("ar");
    expect(detectLanguage("ايباد برو 11 انش m1").code).toBe("ar");
  });

  it("tells the model the store's own language does not decide", () => {
    const text = languageInstructionText(resolveReplyLanguage({ setting: "auto", messageText: ARABIC[1] }));
    expect(text).toMatch(/wrote in Arabic/);
    // The original bug was an English discount line inside a Spanish reply.
    expect(text).toMatch(/discount/);
    expect(text).toMatch(/Never mix languages/);
    expect(text).toMatch(/store's own instructions/);
  });

  it("still lets the merchant force a language", () => {
    const resolved = resolveReplyLanguage({ setting: "es", messageText: ARABIC[1] });
    expect(resolved).toEqual({ code: "es", name: "Spanish", source: "forced" });
  });

  it("beats the store locale, because it is the customer talking", () => {
    const resolved = resolveReplyLanguage({
      setting: "auto",
      messageText: ARABIC[1],
      storeLocale: "es-MX",
    });
    expect(resolved.code).toBe("ar");
  });
});

describe("mirroring a language we do not enumerate", () => {
  it("mirrors a Latin-script language the word lists do not know", () => {
    expect(resolveReplyLanguage({ setting: "auto", messageText: "merhaba, bu elbise ne kadar" }).source).toBe(
      "mirror"
    );
  });

  it("tells the model to match the customer's script and not translate", () => {
    const text = languageInstructionText(
      resolveReplyLanguage({ setting: "auto", messageText: "merhaba, bu elbise ne kadar" })
    );
    expect(text).toMatch(/SAME language/);
    expect(text).toMatch(/Do not translate to English/);
    expect(text).toMatch(/discount/);
    expect(text).toMatch(/Never mix languages/);
  });

  // Regression guard for a183e64: hearts were mirrored, the model guessed
  // Spanish, and the reply came back in two languages.
  it("does not mirror hearts, which is what forced English is for", () => {
    const resolved = resolveReplyLanguage({
      setting: "auto",
      messageText: "❤️❤️❤️❤️",
      storeLocale: "en",
    });
    expect(resolved).toEqual({ code: "en", name: "English", source: "default" });
  });

  it("leaves a recognised language on its own detected path, not mirroring", () => {
    expect(resolveReplyLanguage({ setting: "auto", messageText: "Hola, quiero este por favor" }).source).toBe(
      "customer"
    );
    expect(resolveReplyLanguage({ setting: "auto", messageText: "Love these products" }).source).toBe(
      "customer"
    );
  });
});

// Tabcase, 24 Nov 2026. The customer wrote "How much for tab case?" then
// "A16 ipad", and was answered in Arabic, the language of the store's own
// instructions. Neither message matched the old English word list.
describe("a message with no language of its own", () => {
  it("detects plain English questions", () => {
    expect(detectMessageLanguage("How much for tab case?")).toBe("en");
    expect(detectMessageLanguage("Is this available?")).toBe("en");
    expect(detectMessageLanguage("Do you have it in black?")).toBe("en");
  });

  it("takes the language the customer has been writing in", () => {
    expect(
      resolveReplyLanguage({ setting: "auto", messageText: "A16 ipad", recentCustomerTexts: ["How much for tab case?"] })
    ).toEqual({ code: "en", name: "English", source: "thread" });
    expect(
      resolveReplyLanguage({ setting: "auto", messageText: "Ipad pro 12.9", recentCustomerTexts: ["متوفر", "مساء الخير"] })
    ).toMatchObject({ code: "ar", source: "thread" });
    expect(
      resolveReplyLanguage({ setting: "auto", messageText: "✨🌸", recentCustomerTexts: ["شكرا لك"] })
    ).toMatchObject({ code: "ar", source: "thread" });
  });

  it("lets a customer switch language", () => {
    expect(
      resolveReplyLanguage({ setting: "auto", messageText: "How much is it?", recentCustomerTexts: ["مساء الخير"] })
    ).toMatchObject({ code: "en", source: "customer" });
  });

  it("says why in the instruction", () => {
    const resolved = resolveReplyLanguage({
      setting: "auto",
      messageText: "A16 ipad",
      recentCustomerTexts: ["How much for tab case?"],
    });
    expect(languageInstructionText(resolved)).toMatch(/has been writing to you in English/);
  });
});

describe("replyLanguageMismatch", () => {
  const TABCASE_REPLY =
    'متوفر كفر iPad Design 16 بسعر 7.5 ر.ع، ويجي لموديلات: iPad 10، Pro 11" M4، Air 13" M3، Mini 6. إذا تبي تطلب، خبرني موديل جهازك';
  const english = resolveReplyLanguage({ setting: "auto", messageText: "How much for tab case?" });
  const arabic = resolveReplyLanguage({ setting: "auto", messageText: "ايباد برو 11 انش m1" });

  it("catches the Arabic reply Tabcase sent an English customer", () => {
    expect(replyLanguageMismatch(TABCASE_REPLY, english, "A16 ipad")).toBe(true);
  });

  it("accepts an Arabic reply full of Latin product names for an Arabic customer", () => {
    expect(replyLanguageMismatch(TABCASE_REPLY, arabic, "ايباد برو 11 انش m1")).toBe(false);
  });

  it("catches an English reply to an Arabic customer", () => {
    expect(replyLanguageMismatch("We have the iPad Pro 11 M1 case for 7.5 OMR. Order here.", arabic)).toBe(true);
  });

  it("catches a different Latin language", () => {
    expect(replyLanguageMismatch("Hola, tenemos este para ti, quieres el enlace para comprar?", english)).toBe(true);
  });

  it("accepts a reply in the right language", () => {
    expect(replyLanguageMismatch("We have it for 7.5 OMR. Which iPad do you have?", english)).toBe(false);
  });

  it("checks a mirrored reply against the customer's own script", () => {
    const mirror = resolveReplyLanguage({ setting: "auto", messageText: "A16 ipad" });
    expect(replyLanguageMismatch(TABCASE_REPLY, mirror, "A16 ipad")).toBe(true);
  });
});

describe("normalizeStoreLocale", () => {
  it("maps Shopify locales onto the languages we support", () => {
    expect(normalizeStoreLocale("en-US")).toBe("en");
    expect(normalizeStoreLocale("es-MX")).toBe("es");
    expect(normalizeStoreLocale("pt-BR")).toBe("pt-BR");
    expect(normalizeStoreLocale("ja")).toBeNull();
  });
});

describe("languageInstructionText", () => {
  it("tells the model not to guess a language for hearts", () => {
    const text = languageInstructionText({ code: "en", name: "English", source: "default" });
    expect(text).toMatch(/English/);
    expect(text).toMatch(/Do not guess Spanish/);
    expect(text).toMatch(/Never mix languages/);
  });
});

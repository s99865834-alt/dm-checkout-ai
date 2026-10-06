import { describe, it, expect } from "vitest";
import {
  detectMessageLanguage,
  hasWords,
  languageInstructionText,
  normalizeStoreLocale,
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

describe("mirroring a language we do not enumerate", () => {
  it("mirrors every one of State of Her's real Arabic DMs", () => {
    for (const text of ARABIC) {
      const resolved = resolveReplyLanguage({ setting: "auto", messageText: text });
      expect(resolved.source).toBe("mirror");
      expect(resolved.code).toBeNull();
    }
  });

  it("mirrors other unenumerated languages too, Latin script included", () => {
    for (const text of ["こんにちは、これはいくらですか", "Γεια σας, πόσο κοστίζει", "merhaba, bu elbise ne kadar"]) {
      expect(resolveReplyLanguage({ setting: "auto", messageText: text }).source).toBe("mirror");
    }
  });

  it("tells the model to match the customer's script and not translate", () => {
    const text = languageInstructionText(
      resolveReplyLanguage({ setting: "auto", messageText: ARABIC[1] })
    );
    expect(text).toMatch(/SAME language/);
    expect(text).toMatch(/Do not translate to English/);
    // The original bug was an English discount line inside a Spanish reply.
    expect(text).toMatch(/discount/);
    expect(text).toMatch(/Never mix languages/);
  });

  it("still lets the merchant force a language over mirroring", () => {
    const resolved = resolveReplyLanguage({ setting: "es", messageText: ARABIC[1] });
    expect(resolved).toEqual({ code: "es", name: "Spanish", source: "forced" });
  });

  it("beats the store locale, because it is the customer talking", () => {
    const resolved = resolveReplyLanguage({
      setting: "auto",
      messageText: ARABIC[1],
      storeLocale: "es-MX",
    });
    expect(resolved.source).toBe("mirror");
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

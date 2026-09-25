import { describe, it, expect } from "vitest";
import {
  detectMessageLanguage,
  languageInstructionText,
  normalizeStoreLocale,
  resolveReplyLanguage,
} from "../app/lib/reply-language";

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

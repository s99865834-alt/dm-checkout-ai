/**
 * Two things the model got wrong on Tabcase in Nov 2026, from data it was
 * given badly rather than from anything it could have known:
 *
 * - A customer sent two photos and asked "are these two available?". The
 *   photos reached the model as "(no text)", so it asked for a photo.
 * - "A16 ipad" was matched to "iPad Case – Design 16". Catalog search ranks
 *   loosely, and the code was falling back to the top result.
 */
import { describe, it, expect } from "vitest";
import { threadMessageText, customerSentMedia } from "../app/lib/attachment-kind";
import { asksForPhoto } from "../app/lib/reply-rules";
import { modelCodes, containsCode, pickCatalogMatch } from "../app/lib/variant-match";

describe("threadMessageText", () => {
  it("says a photo was sent and that the model cannot see it", () => {
    const m = { content_type: "image", attachment_meta: { types: ["image", "image"] }, text: null };
    expect(threadMessageText(m)).toBe("[sent 2 photos, which you cannot see]");
    expect(threadMessageText({ content_type: "image", attachment_meta: { types: ["image"] } })).toBe(
      "[sent a photo, which you cannot see]"
    );
  });

  it("names shared posts and reels", () => {
    expect(threadMessageText({ content_type: "share" })).toBe("[shared an Instagram post]");
    expect(threadMessageText({ content_type: "unsupported", attachment_meta: { types: ["ig_reel"] } })).toBe(
      "[shared a reel, which you cannot see]"
    );
  });

  it("keeps text, and keeps the old placeholder for a truly empty message", () => {
    expect(threadMessageText({ text: "متوفر؟" })).toBe("متوفر؟");
    expect(threadMessageText({ content_type: "story_reply", text: "love it" })).toBe("[replied to the store's story] love it");
    expect(threadMessageText({ text: "" })).toBe("(no text)");
  });
});

describe("customerSentMedia", () => {
  it("sees photos and videos anywhere in the thread", () => {
    expect(customerSentMedia([{ text: "are these available?" }, { content_type: "image" }])).toBe(true);
    expect(customerSentMedia([{ attachment_meta: { types: ["video"] } }])).toBe(true);
  });

  it("does not count shared posts, hearts or plain text", () => {
    expect(customerSentMedia([{ content_type: "share" }, { content_type: "heart" }, { text: "hi" }])).toBe(false);
    expect(customerSentMedia(null)).toBe(false);
  });
});

describe("asksForPhoto", () => {
  it.each([
    "ممكن ترسل لي صورة أو اسم الكفرين؟",
    "Could you send me a picture of it?",
    "Send a screenshot and I'll check",
    "¿Me mandas una foto?",
    "Можете прислать фото?",
  ])("fires on %s", (text) => {
    expect(asksForPhoto(text)).toBe(true);
  });

  it("does not fire on a reply that never mentions one", () => {
    expect(asksForPhoto("Which design do you mean, and which iPad do you have?")).toBe(false);
  });
});

describe("model codes", () => {
  it("finds codes that mix letters and digits", () => {
    expect(modelCodes("A16 ipad")).toEqual(["a16"]);
    expect(modelCodes("ايباد برو 11 انش m1")).toEqual(["m1"]);
    expect(modelCodes("Galaxy S24, size 2XL, SM-T500")).toEqual(["s24", "2xl", "smt500"]);
    expect(modelCodes("iPad Pro 12.9 and Design 16")).toEqual([]);
  });

  it("matches a code only as a whole", () => {
    expect(containsCode("iPad Case – Design 16", "a16")).toBe(false);
    expect(containsCode("iPad (A16) Case", "a16")).toBe(true);
    expect(containsCode("Cover for iPad A 16", "a16")).toBe(true);
    expect(containsCode('Pro 11" M4', "m4")).toBe(true);
  });
});

describe("pickCatalogMatch", () => {
  const design16 = {
    id: "16",
    title: "iPad Case – Design 16",
    variants: { nodes: [{ title: "iPad 10" }, { title: 'Pro 11" M4' }] },
  };
  const a16 = { id: "a", title: "iPad Case – Design 24", variants: { nodes: [{ title: "iPad (A16)" }] } };

  it("does not hand back a product that only shares a number with the code", () => {
    expect(pickCatalogMatch([design16], "A16 ipad")).toBeNull();
  });

  it("picks the product whose options carry the code", () => {
    expect(pickCatalogMatch([design16, a16], "A16 ipad")).toBe(a16);
  });

  it("keeps the old ranking when no code was named", () => {
    expect(pickCatalogMatch([design16, a16], "do you have iPad cases")).toBe(design16);
    expect(pickCatalogMatch([design16, a16], null)).toBe(design16);
    expect(pickCatalogMatch([design16, a16], "iPad Case – Design 24")).toBe(a16);
  });
});

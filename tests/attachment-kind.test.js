/**
 * Classifying Instagram's text-less DM payloads.
 *
 * The shared-post path was built around Meta labelling a forwarded post
 * `share`. In production that label arrived twice, ever, while `ig_post`
 * arrived six times and fell through to "unsupported". So the highest-intent
 * non-text payload was being dropped by the code written to handle it, and
 * nothing noticed because these functions lived inside a webhook route where
 * no test could reach them.
 */
import { describe, it, expect } from "vitest";
import {
  SHARED_POST_TYPES,
  deriveAttachmentContentType,
  extractSharedMediaId,
  sharedPostUrlParamNames,
} from "../app/lib/attachment-kind";

const att = (type, url) => ({ type, payload: url ? { url } : undefined });

describe("deriveAttachmentContentType", () => {
  it.each(["share", "ig_post"])("treats %s as a forwarded post", (type) => {
    expect(deriveAttachmentContentType([att(type)])).toBe("share");
  });

  it("still drops a shared reel", () => {
    // Deliberate: of 82 reel shares, 75 were on one account whose DMs are
    // friends swapping videos, and only 3 sat in a thread the owner was
    // handling. Answering them would have pitched products into banter.
    expect(deriveAttachmentContentType([att("ig_reel")])).toBe("unsupported");
  });

  it("prefers a forwarded post over other attachments in the same message", () => {
    expect(deriveAttachmentContentType([att("image"), att("ig_post")])).toBe("share");
  });

  it("recognises a story mention", () => {
    expect(deriveAttachmentContentType([att("story_mention")])).toBe("story_mention");
  });

  it.each(["like_heart", "sticker"])("treats %s as a heart", (type) => {
    expect(deriveAttachmentContentType([att(type)])).toBe("heart");
  });

  it.each(["image", "video", "audio", "file"])("passes %s through", (type) => {
    expect(deriveAttachmentContentType([att(type)])).toBe(type);
  });

  it.each(["ig_story", "ephemeral", "something_new"])(
    "marks %s unsupported rather than guessing",
    (type) => {
      expect(deriveAttachmentContentType([att(type)])).toBe("unsupported");
    }
  );

  it("is case insensitive, since Meta's casing isn't guaranteed", () => {
    expect(deriveAttachmentContentType([att("IG_POST")])).toBe("share");
  });

  it.each([null, undefined, []])("returns null for %s attachments", (value) => {
    expect(deriveAttachmentContentType(value)).toBeNull();
  });
});

describe("extractSharedMediaId", () => {
  const url = (id) => `https://lookaside.fbsbx.com/x?asset_id=${id}&token=abc`;

  it.each(["share", "ig_post"])("reads the media id from a %s payload", (type) => {
    expect(extractSharedMediaId([att(type, url("17912345678901234"))])).toBe("17912345678901234");
  });

  it("does not read one from a reel, which stays unhandled", () => {
    expect(extractSharedMediaId([att("ig_reel", url("123"))])).toBeNull();
  });

  it("returns null when the url carries no asset_id", () => {
    // Every ig_post seen in production recorded a null media id, because this
    // function used to skip them entirely.
    expect(extractSharedMediaId([att("ig_post", "https://lookaside.fbsbx.com/x?token=abc")])).toBeNull();
  });

  it.each([null, undefined, [], [att("ig_post")]])("returns null for %s", (value) => {
    expect(extractSharedMediaId(value)).toBeNull();
  });
});

describe("sharedPostUrlParamNames", () => {
  it("reports the parameter names so a missing id can be diagnosed", () => {
    const names = sharedPostUrlParamNames([
      att("ig_post", "https://lookaside.fbsbx.com/x?media_id=99&oh=aa&oe=bb"),
    ]);
    expect(names.sort()).toEqual(["media_id", "oe", "oh"]);
  });

  it("never returns the url itself, which is a signed link that expires", () => {
    const names = sharedPostUrlParamNames([
      att("ig_post", "https://lookaside.fbsbx.com/secret-path?asset_id=1"),
    ]);
    expect(names.join(" ")).not.toContain("lookaside");
    expect(names.join(" ")).not.toContain("secret-path");
  });

  it("survives an unparsable url", () => {
    expect(sharedPostUrlParamNames([att("ig_post", "not a url")])).toEqual([]);
  });

  it.each([null, undefined, []])("returns an empty list for %s", (value) => {
    expect(sharedPostUrlParamNames(value)).toEqual([]);
  });
});

describe("SHARED_POST_TYPES", () => {
  it("covers both labels Meta uses and excludes reels", () => {
    expect(SHARED_POST_TYPES).toContain("share");
    expect(SHARED_POST_TYPES).toContain("ig_post");
    expect(SHARED_POST_TYPES).not.toContain("ig_reel");
  });
});

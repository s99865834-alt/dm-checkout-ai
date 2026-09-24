import { describe, it, expect } from "vitest";
import {
  pickCollectionMatch,
  findCollectionMatches,
  searchCollections,
  isGenericBrowseCollection,
  collectionHandleFromUrl,
} from "../app/lib/collection-match";

const LUNA_COLLECTIONS = [
  { title: "Aries", handle: "aries" },
  { title: "Nail Polish", handle: "nail-polish" },
  { title: "Zodiac Shades", handle: "zodiac-shades" },
  { title: "Best Sellers", handle: "best-sellers" },
  { title: "Home page", handle: "frontpage" },
  { title: "Under $25", handle: "under-25" },
  { title: "New Arrivals", handle: "new-arrivals" },
];

const LUNA_CAPTION = `Under the upcoming full moon in Aries on 9/26, things can feel a little more obvious.

Swipe to the end to check out our Aries Nail Polish, a bold red infused with micronized red jasper.

Comment MANI for a link to shop all of our crystal-infused shades. We recommend looking at the colors for your sun, moon, rising, and venus as any of those shades may resonate.`;

describe("pickCollectionMatch", () => {
  it("picks Nail Polish over Aries when the caption names both", () => {
    const match = pickCollectionMatch(LUNA_COLLECTIONS, LUNA_CAPTION);
    expect(match?.handle).toBe("nail-polish");
    expect(findCollectionMatches(LUNA_COLLECTIONS, LUNA_CAPTION).map((c) => c.handle)).toEqual([
      "nail-polish",
      "aries",
    ]);
  });

  it("searchCollections still finds a collection from a short query", () => {
    expect(searchCollections(LUNA_COLLECTIONS, "nail polish")[0]?.handle).toBe("nail-polish");
    expect(searchCollections(LUNA_COLLECTIONS, "zodiac")[0]?.handle).toBe("zodiac-shades");
  });

  it("does not treat the homepage-fallback reply copy as a collection request", () => {
    expect(pickCollectionMatch(LUNA_COLLECTIONS, "check out this collection for yourself")).toBeNull();
  });

  it("matches a named collection when that is all the caption has", () => {
    expect(pickCollectionMatch(LUNA_COLLECTIONS, "full moon in Aries this week")?.handle).toBe("aries");
  });

  it("ignores merchandising buckets that would dump the customer into the whole catalog", () => {
    expect(pickCollectionMatch(LUNA_COLLECTIONS, "shop our best sellers and new arrivals")).toBeNull();
    expect(isGenericBrowseCollection({ handle: "frontpage" })).toBe(true);
    expect(isGenericBrowseCollection({ handle: "under-25" })).toBe(true);
  });

  it("needs the title as a phrase, not a scattered word", () => {
    expect(pickCollectionMatch(LUNA_COLLECTIONS, "love the zodiac sign energy")).toBeNull();
    expect(pickCollectionMatch(LUNA_COLLECTIONS, "these zodiac shades are perfect")?.handle).toBe(
      "zodiac-shades",
    );
  });
});

describe("collectionHandleFromUrl", () => {
  it("reads a named collection and ignores /collections/all", () => {
    expect(collectionHandleFromUrl("https://lovebyluna.co/collections/nail-polish")).toBe("nail-polish");
    expect(collectionHandleFromUrl("https://lovebyluna.co/collections/all")).toBeNull();
    expect(collectionHandleFromUrl("https://lovebyluna.myshopify.com")).toBeNull();
  });
});

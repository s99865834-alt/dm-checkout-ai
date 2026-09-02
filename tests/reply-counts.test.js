import { describe, it, expect } from "vitest";
// Imported from reply-counts, not db.server: that module builds the Supabase
// client at import time and needs credentials CI does not have.
import { countRepliesByShop } from "../app/lib/reply-counts";

const SHOP = "shop-1";
const OTHER = "shop-2";

const claim = (messageId, extra = {}) => ({
  shop_id: SHOP,
  message_id: messageId,
  link_id: `dm_reply_comment_${messageId}`,
  failed_reason: null,
  ...extra,
});

const link = (messageId, linkId, extra = {}) => ({
  shop_id: SHOP,
  message_id: messageId,
  link_id: linkId,
  failed_reason: null,
  ...extra,
});

describe("countRepliesByShop", () => {
  it("counts one reply once, not once per row", () => {
    // This is the shape that inflated /admin: a claim row plus the link row.
    const { delivered } = countRepliesByShop([claim("m1"), link("m1", "abc12345")]);
    expect(delivered.get(SHOP)).toBe(1);
  });

  it("counts a reply carrying both a checkout and a product-page link once", () => {
    const { delivered } = countRepliesByShop([
      claim("m1"),
      link("m1", "abc12345"),
      link("m1", "pdp_abc12345"),
    ]);
    expect(delivered.get(SHOP)).toBe(1);
  });

  it("counts separate replies separately", () => {
    const { delivered } = countRepliesByShop([
      claim("m1"),
      link("m1", "abc12345"),
      claim("m2"),
      link("m2", "info_deadbeef1234"),
      claim("m3"),
    ]);
    expect(delivered.get(SHOP)).toBe(3);
  });

  it("does not count a reply Instagram refused", () => {
    const { delivered, undelivered } = countRepliesByShop([
      claim("m1"),
      claim("m2", { failed_reason: "instagram_reply_already_exists" }),
    ]);
    expect(delivered.get(SHOP)).toBe(1);
    expect(undelivered.get(SHOP)).toBe(1);
  });

  it("reports no undelivered replies when every send landed", () => {
    const { undelivered } = countRepliesByShop([claim("m1"), link("m1", "abc12345")]);
    expect(undelivered.get(SHOP)).toBeUndefined();
  });

  it("keeps shops apart", () => {
    const { delivered } = countRepliesByShop([
      claim("m1"),
      { shop_id: OTHER, message_id: "m9", link_id: "dm_reply_comment_m9", failed_reason: null },
      { shop_id: OTHER, message_id: "m9", link_id: "xyz98765", failed_reason: null },
    ]);
    expect(delivered.get(SHOP)).toBe(1);
    expect(delivered.get(OTHER)).toBe(1);
  });

  it("ignores rows that can't be tied to a reply", () => {
    // Counting these would reintroduce the double count, since the reply they
    // belong to is already counted through its claim row.
    const { delivered } = countRepliesByShop([
      claim("m1"),
      link(null, "orphan01"),
      { shop_id: null, message_id: "m5", link_id: "nope", failed_reason: null },
    ]);
    expect(delivered.get(SHOP)).toBe(1);
  });

  it.each([null, undefined, []])("returns empty maps for %s", (rows) => {
    const { delivered, undelivered } = countRepliesByShop(rows);
    expect(delivered.size).toBe(0);
    expect(undelivered.size).toBe(0);
  });

  it("matches the real Mark Watts shape from the audit", () => {
    // 9 replies were claimed, 1 was refused, and usage_count (which only ever
    // increments on a successful send) stood at 8.
    const rows = [];
    for (let i = 1; i <= 8; i += 1) {
      rows.push(claim(`m${i}`));
      rows.push(link(`m${i}`, `info_${i}`.padEnd(17, "0")));
    }
    rows.push(claim("m9", { failed_reason: "instagram_reply_already_exists" }));

    const { delivered, undelivered } = countRepliesByShop(rows);
    expect(delivered.get(SHOP)).toBe(8);
    expect(undelivered.get(SHOP)).toBe(1);
  });
});

/**
 * The discount suggestion in Pro insights. It only appears when this shop's
 * own numbers call for it: enough people opened a DM checkout link and almost
 * none bought, and no discount is on yet.
 *
 * Love by Luna, Nov 2026: 30 people opened a checkout link in 30 days and none
 * bought, with no discount on. Shabby2Chic: 2 opened, 1 bought. Only the first
 * should be told to turn one on.
 */
import { describe, it, expect } from "vitest";
import {
  APP_ACTIONS,
  discountSuggestion,
  liveInsightActions,
  withoutDiscountActions,
} from "../app/lib/insights";

const base = { discountEnabled: false, canDiscount: true };

describe("discountSuggestion", () => {
  it("suggests a discount when people open links and nobody buys", () => {
    const s = discountSuggestion({ ...base, opened: 30, orders: 0 });
    expect(s).toMatchObject({ kind: "app", title: "Turn on a discount for DM checkout links" });
    expect(s.detail).toContain("30 people opened a checkout link");
    expect(s.detail).toContain("none of them bought");
    expect(s.basis).toBe("Based on: 30 links opened, 0 orders, last 30 days");
    expect(s.cta.href).toBe("/app#sr-discount");
  });

  it("still suggests one when only a sliver bought", () => {
    expect(discountSuggestion({ ...base, opened: 30, orders: 1 }).detail).toContain("only 1 bought");
  });

  it.each([
    ["too few opens to judge", { opened: 9, orders: 0 }],
    ["links already converting", { opened: 30, orders: 2 }],
    ["Shabby2Chic's numbers", { opened: 2, orders: 1 }],
  ])("stays quiet with %s", (_label, numbers) => {
    expect(discountSuggestion({ ...base, ...numbers })).toBeNull();
  });

  it("stays quiet once a discount is on, or when the plan has no discounts", () => {
    expect(discountSuggestion({ ...base, discountEnabled: true, opened: 30, orders: 0 })).toBeNull();
    expect(discountSuggestion({ ...base, canDiscount: false, opened: 30, orders: 0 })).toBeNull();
  });
});

describe("the AI no longer suggests discounts itself", () => {
  it("leaves discounts off the list of app changes it may suggest", () => {
    expect(APP_ACTIONS.some((a) => /discount/i.test(a))).toBe(false);
  });

  it("drops a discount suggestion from an older summary", () => {
    const stored = [
      { kind: "app", title: "Turn on a product discount", detail: "Nudge people who open the link" },
      { kind: "content", title: "Post a sizing story", detail: "People keep asking about fit" },
    ];
    expect(withoutDiscountActions(stored).map((a) => a.title)).toEqual(["Post a sizing story"]);
  });

  it("keeps a content idea that happens to mention a sale", () => {
    const stored = [{ kind: "content", title: "Announce the holiday sale in a story", detail: "" }];
    expect(withoutDiscountActions(stored)).toHaveLength(1);
  });
});

describe("liveInsightActions", () => {
  const stored = [
    { kind: "content", title: "A" },
    { kind: "store", title: "B" },
    { kind: "app", title: "Turn on a product discount", detail: "" },
    { kind: "content", title: "C" },
  ];

  it("puts the live discount suggestion first and keeps at most three", () => {
    const live = discountSuggestion({ ...base, opened: 30, orders: 0 });
    expect(liveInsightActions(stored, live).map((a) => a.title)).toEqual([live.title, "A", "B"]);
  });

  it("shows only the stored suggestions when the numbers don't call for a discount", () => {
    expect(liveInsightActions(stored, null).map((a) => a.title)).toEqual(["A", "B", "C"]);
  });
});

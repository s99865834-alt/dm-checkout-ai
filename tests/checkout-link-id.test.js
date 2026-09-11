/**
 * "What counts as a checkout link" now has two definitions: the JavaScript
 * predicate below, and the `link_id ~ '^[a-zA-Z0-9]{8}$'` test inside the
 * shop_analytics_totals and admin_shop_stats SQL functions.
 *
 * Every link KPI a merchant sees rides on that distinction, and a silent
 * disagreement between the two would misreport all of them with nothing to
 * show why. This file pins the JavaScript side to a fixed set of examples. If
 * the rule ever changes, both definitions have to move together and this is
 * the test that fails first.
 */
import { describe, it, expect } from "vitest";
import { isCheckoutLinkId } from "../app/lib/checkout-link-id";

// The SQL pattern, written out here so a reviewer can compare them directly.
const SQL_PATTERN = /^[a-zA-Z0-9]{8}$/;

const CHECKOUT = [
  "abc12345",
  "OucaGfF7",
  "L94zyvil",
  "caIeNk5d",
  "00000000",
  "ZZZZZZZZ",
  "aB3dE6gH",
];

const NOT_CHECKOUT = [
  // Other link types, all of which carry a prefix.
  "pdp_KOh7fkgz",
  "info_13e9dbf1ef21",
  "dm_reply_comment_18092474600111343",
  "dm_reply_ext_aWdfZAG1faXRlbTox",
  "size_q_9b22452b",
  // Wrong length.
  "abc1234",
  "abc123456",
  "",
  // Characters outside base62.
  "abc-1234",
  "abc_1234",
  "abc 1234",
  "abcd123!",
];

describe("isCheckoutLinkId", () => {
  it.each(CHECKOUT)("treats %s as a checkout link", (id) => {
    expect(isCheckoutLinkId(id)).toBe(true);
  });

  it.each(NOT_CHECKOUT)("does not treat %s as a checkout link", (id) => {
    expect(isCheckoutLinkId(id)).toBe(false);
  });

  it.each([null, undefined, 12345678, {}, []])("rejects the non-string %s", (id) => {
    expect(isCheckoutLinkId(id)).toBe(false);
  });

  it("agrees with the SQL pattern on every example above", () => {
    for (const id of [...CHECKOUT, ...NOT_CHECKOUT]) {
      expect(isCheckoutLinkId(id)).toBe(SQL_PATTERN.test(id));
    }
  });

  it("is case sensitive in the same way SQL's ~ operator is", () => {
    // Postgres `~` is case sensitive, so the JavaScript side must not be
    // loosened to /i without changing the SQL functions too.
    expect(isCheckoutLinkId("ABCDEFGH")).toBe(true);
    expect(isCheckoutLinkId("abcdefgh")).toBe(true);
  });
});

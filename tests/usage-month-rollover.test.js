/**
 * The monthly cap has to stop counting when the month ends.
 *
 * It did not. A shop over its cap stops sending; sends are the only thing that
 * call increment_usage; increment_usage is the only thing that rolls the month
 * forward on the webhook path. So the counter froze and every later month was
 * measured against it. Mark Watts Studios last replied on 14 Sep and
 * Shanesecaresllc on 13 Sep, and both were still silent on 8 Oct with 75
 * buying-intent messages unanswered between them.
 */
import { describe, it, expect, vi } from "vitest";

// db.server reads Supabase env at import time and throws without it, which
// fails in CI where there is no .env. The function under test is pure.
vi.mock("../app/lib/supabase.server", () => ({
  default: { from: () => ({}), rpc: async () => ({ data: null, error: null }) },
}));

import { isUsageMonthCurrent } from "../app/lib/db.server";

const thisMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

const monthsAgo = (n) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1)).toISOString().slice(0, 10);
};

describe("isUsageMonthCurrent", () => {
  it("accepts the current month", () => {
    expect(isUsageMonthCurrent(thisMonth())).toBe(true);
  });

  it("accepts a full timestamp in the current month", () => {
    expect(isUsageMonthCurrent(`${thisMonth()}T00:00:00+00:00`)).toBe(true);
    expect(isUsageMonthCurrent(new Date())).toBe(true);
  });

  it("rejects last month, which is what left two shops permanently silent", () => {
    expect(isUsageMonthCurrent(monthsAgo(1))).toBe(false);
    expect(isUsageMonthCurrent(monthsAgo(2))).toBe(false);
  });

  it("rejects a missing month rather than assuming it is current", () => {
    expect(isUsageMonthCurrent(null)).toBe(false);
    expect(isUsageMonthCurrent(undefined)).toBe(false);
    expect(isUsageMonthCurrent("")).toBe(false);
  });

  // The two real rows as they stood on 8 Oct 2026.
  it("treats September usage as spent when the clock says October", () => {
    expect(isUsageMonthCurrent("2026-09-01")).toBe(
      thisMonth() === "2026-09-01"
    );
  });
});

import { describe, it, expect } from "vitest";
import { storeRevenueYtdSearch } from "../app/lib/shopify-data.server";

describe("storeRevenueYtdSearch", () => {
  it("includes closed and cancelled orders, not only the ones still open", () => {
    const search = storeRevenueYtdSearch("2026-01-01");
    expect(search).toContain("created_at:>=2026-01-01");
    expect(search).toContain("status:open");
    expect(search).toContain("status:closed");
    expect(search).toContain("status:cancelled");
  });
});

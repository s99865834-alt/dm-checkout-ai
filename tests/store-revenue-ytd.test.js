import { describe, it, expect, vi } from "vitest";
import { storeRevenueYtdSearch } from "../app/lib/shopify-data.server";

vi.mock("../app/lib/supabase.server", () => ({ default: {} }));
vi.mock("../app/shopify.server", () => ({ unauthenticated: {} }));

describe("storeRevenueYtdSearch", () => {
  it("includes closed and cancelled orders, not only the ones still open", () => {
    const search = storeRevenueYtdSearch("2026-01-01");
    expect(search).toContain("created_at:>=2026-01-01");
    expect(search).toContain("status:open");
    expect(search).toContain("status:closed");
    expect(search).toContain("status:cancelled");
  });
});

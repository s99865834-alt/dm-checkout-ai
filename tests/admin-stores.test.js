import { describe, it, expect } from "vitest";
import { sanitizeAdminStoreSearch, ADMIN_STORES_PAGE_SIZE } from "../app/lib/admin-stores";

describe("sanitizeAdminStoreSearch", () => {
  it("strips PostgREST-breaking characters and caps length", () => {
    expect(sanitizeAdminStoreSearch("love%by_luna, (x)")).toBe("lovebyluna x");
    expect(sanitizeAdminStoreSearch("a".repeat(200)).length).toBe(80);
    expect(sanitizeAdminStoreSearch(null)).toBe("");
  });
});

describe("ADMIN_STORES_PAGE_SIZE", () => {
  it("stays well under PostgREST's 1,000-row cap", () => {
    expect(ADMIN_STORES_PAGE_SIZE).toBeGreaterThan(0);
    expect(ADMIN_STORES_PAGE_SIZE).toBeLessThan(1000);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isMetaScannerIp, META_IPV4_CIDRS, META_IPV6_PREFIX } from "../app/lib/meta-scanner.js";

describe("isMetaScannerIp", () => {
  it("matches the Meta addresses seen hitting checkout links", () => {
    expect(isMetaScannerIp("69.63.184.5")).toBe(true);
    expect(isMetaScannerIp("173.252.95.21")).toBe(true);
    expect(isMetaScannerIp("57.141.0.42")).toBe(true);
    expect(isMetaScannerIp("2a03:2880:f0ff:c::face:b00c")).toBe(true);
    expect(isMetaScannerIp("::ffff:31.13.66.1")).toBe(true);
  });

  it("does not match customers, Private Relay, or range edges", () => {
    expect(isMetaScannerIp("67.162.147.46")).toBe(false);
    expect(isMetaScannerIp("172.70.12.9")).toBe(false);
    expect(isMetaScannerIp("69.63.192.0")).toBe(false);
    expect(isMetaScannerIp("2600:1700::1")).toBe(false);
  });

  it("treats missing or malformed input as not Meta", () => {
    expect(isMetaScannerIp(null)).toBe(false);
    expect(isMetaScannerIp("")).toBe(false);
    expect(isMetaScannerIp("not-an-ip")).toBe(false);
    expect(isMetaScannerIp("300.1.1.1")).toBe(false);
  });

  it("uses the same ranges as the SQL analytics filter", () => {
    const sql = readFileSync(new URL("../supabase_migration_meta_scanner_clicks.sql", import.meta.url), "utf8");
    const body = sql.slice(sql.indexOf("is_meta_scanner_ip(p_ip inet)"), sql.indexOf("$$;"));
    const sqlRanges = [...body.matchAll(/'([0-9a-f.:]+\/\d+)'/g)].map((m) => m[1]);
    const ipv6 = sqlRanges.filter((r) => r.includes(":"));
    expect(sqlRanges.filter((r) => !r.includes(":")).sort()).toEqual([...META_IPV4_CIDRS].sort());
    expect(ipv6).toEqual(["2a03:2880::/32"]);
    expect(META_IPV6_PREFIX).toBe("2a03:2880:");
  });
});

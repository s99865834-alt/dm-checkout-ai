/**
 * The tripwire for PostgREST's silent 1,000-row truncation.
 *
 * That silence caused three bugs in a row: /admin froze for days once
 * links_sent passed 1,000 rows (Love By Luna read 196 against a true 208), the
 * merchant analytics page was about a week from the same fate, and the Pro
 * page had it too. All three now aggregate in SQL. This exists so the next
 * place it happens announces itself instead of quietly returning a wrong
 * answer.
 */
import { describe, it, expect, vi } from "vitest";
import { POSTGREST_ROW_CAP, looksTruncated, warnIfTruncated } from "../app/lib/row-cap";

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe("looksTruncated", () => {
  it("fires at exactly the cap", () => {
    expect(looksTruncated(rows(POSTGREST_ROW_CAP))).toBe(true);
  });

  it.each([0, 1, 999, 1001])("does not fire at %s rows", (n) => {
    expect(looksTruncated(rows(n))).toBe(false);
  });

  it.each([null, undefined, "not an array", 1000, {}])("returns false for %s", (value) => {
    expect(looksTruncated(value)).toBe(false);
  });

  it("knows the cap that actually bit us", () => {
    // links_sent held 1,065 rows when the dashboard was found frozen.
    expect(POSTGREST_ROW_CAP).toBe(1000);
  });
});

describe("warnIfTruncated", () => {
  it("warns and reports true when truncation is likely", () => {
    const log = { warn: vi.fn() };

    expect(warnIfTruncated("admin links_sent", rows(POSTGREST_ROW_CAP), log)).toBe(true);
    expect(log.warn).toHaveBeenCalledTimes(1);
    // The message has to name the read, or it points at nothing actionable.
    expect(log.warn.mock.calls[0][0]).toContain("admin links_sent");
  });

  it("stays quiet on a normal result", () => {
    const log = { warn: vi.fn() };

    expect(warnIfTruncated("some read", rows(42), log)).toBe(false);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("stays quiet on a missing result rather than throwing", () => {
    const log = { warn: vi.fn() };

    expect(warnIfTruncated("some read", null, log)).toBe(false);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

/**
 * An account we no longer serve must be reported once, not on every event.
 *
 * 24 Oct 2026: a disconnected Instagram account was the loudest line in the
 * production log, repeating "No shop for ig_business_id=..." for every DM and
 * comment Meta kept delivering. The condition is real and unfixable from our
 * side (unsubscribing needs that account's token, which we no longer hold), so
 * the fix is to say it once rather than to stop saying it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { noteUnknownAccount, resetUnknownAccountLog } from "../app/lib/unknown-account-log.server";

let warn;
let debug;

beforeEach(async () => {
  resetUnknownAccountLog();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { default: logger } = await import("../app/lib/logger.server");
  debug = vi.spyOn(logger, "debug").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  debug.mockRestore();
});

describe("noteUnknownAccount", () => {
  it("warns the first time an account is seen", () => {
    const first = noteUnknownAccount("ig_business_id", "17841457226540438");

    expect(first).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("17841457226540438");
    // The operator needs to know the silence that follows is deliberate.
    expect(warn.mock.calls[0][0]).toContain("debug only");
  });

  it("stops warning for that account afterwards", () => {
    noteUnknownAccount("ig_business_id", "17841457226540438");
    for (let i = 0; i < 50; i += 1) {
      expect(noteUnknownAccount("ig_business_id", "17841457226540438")).toBe(false);
    }

    expect(warn).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledTimes(50);
  });

  it("still warns once for a different account", () => {
    noteUnknownAccount("ig_business_id", "17841457226540438");
    noteUnknownAccount("ig_business_id", "17841400000000000");

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("treats the same id under a different field as its own account", () => {
    noteUnknownAccount("ig_business_id", "123");
    noteUnknownAccount("page_id", "123");

    expect(warn).toHaveBeenCalledTimes(2);
  });
});

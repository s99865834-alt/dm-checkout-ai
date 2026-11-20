import { describe, it, expect } from "vitest";
import {
  normalizeReplySchedule,
  isWithinHours,
  isAutomationScheduledOn,
  localDayAndMinutes,
} from "../app/lib/reply-schedule";

// 2026-11-18 is a Wednesday. Denver is UTC-7 in November.
const denver = (iso) => new Date(`${iso}-07:00`);
const base = { enabled: true, mode: "outside", timezone: "America/Denver", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };

describe("normalizeReplySchedule", () => {
  it("returns a disabled default for missing values", () => {
    expect(normalizeReplySchedule(null).enabled).toBe(false);
    expect(normalizeReplySchedule(undefined).days).toEqual([1, 2, 3, 4, 5]);
  });

  it("drops invalid fields instead of trusting them", () => {
    const s = normalizeReplySchedule({ enabled: "yes", mode: "always", timezone: "Mars/Base", days: [9, 2, 2, "3"], start: "25:00", end: "5pm" });
    expect(s).toEqual({ enabled: false, mode: "outside", timezone: "UTC", days: [2, 3], start: "09:00", end: "17:00" });
  });
});

describe("localDayAndMinutes", () => {
  it("reads the wall clock in the given zone", () => {
    expect(localDayAndMinutes(new Date("2026-11-18T23:30:00Z"), "America/Denver")).toEqual({ day: 3, minutes: 16 * 60 + 30 });
    expect(localDayAndMinutes(new Date("2026-11-18T23:30:00Z"), "Asia/Tokyo")).toEqual({ day: 4, minutes: 8 * 60 + 30 });
  });
});

describe("isWithinHours", () => {
  it("handles a same-day range with an exclusive end", () => {
    expect(isWithinHours(base, denver("2026-11-18T09:00:00"))).toBe(true);
    expect(isWithinHours(base, denver("2026-11-18T16:59:00"))).toBe(true);
    expect(isWithinHours(base, denver("2026-11-18T17:00:00"))).toBe(false);
    expect(isWithinHours(base, denver("2026-11-18T08:59:00"))).toBe(false);
  });

  it("ignores unselected days", () => {
    expect(isWithinHours(base, denver("2026-11-21T12:00:00"))).toBe(false);
  });

  it("runs an overnight range into the next morning of the start day", () => {
    const night = { ...base, days: [5], start: "22:00", end: "06:00" };
    expect(isWithinHours(night, denver("2026-11-20T23:00:00"))).toBe(true);
    expect(isWithinHours(night, denver("2026-11-21T05:59:00"))).toBe(true);
    expect(isWithinHours(night, denver("2026-11-21T06:00:00"))).toBe(false);
    expect(isWithinHours(night, denver("2026-11-20T05:00:00"))).toBe(false);
  });

  it("treats equal start and end as the whole day", () => {
    expect(isWithinHours({ ...base, start: "00:00", end: "00:00" }, denver("2026-11-18T03:00:00"))).toBe(true);
  });

  it("is never inside when no days are selected", () => {
    expect(isWithinHours({ ...base, days: [] }, denver("2026-11-18T12:00:00"))).toBe(false);
  });
});

describe("isAutomationScheduledOn", () => {
  it("is always on without an enabled schedule", () => {
    expect(isAutomationScheduledOn(null)).toBe(true);
    expect(isAutomationScheduledOn({ ...base, enabled: false }, denver("2026-11-18T12:00:00"))).toBe(true);
  });

  it("outside mode pauses during the merchant's hours", () => {
    expect(isAutomationScheduledOn(base, denver("2026-11-18T12:00:00"))).toBe(false);
    expect(isAutomationScheduledOn(base, denver("2026-11-18T20:00:00"))).toBe(true);
    expect(isAutomationScheduledOn(base, denver("2026-11-22T12:00:00"))).toBe(true);
  });

  it("during mode only replies inside the merchant's hours", () => {
    const during = { ...base, mode: "during" };
    expect(isAutomationScheduledOn(during, denver("2026-11-18T12:00:00"))).toBe(true);
    expect(isAutomationScheduledOn(during, denver("2026-11-18T20:00:00"))).toBe(false);
  });
});
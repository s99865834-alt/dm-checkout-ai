/**
 * Reply hours: lets a merchant limit when the AI answers.
 *
 * Stored as settings.reply_schedule (jsonb). A missing or disabled schedule
 * means the AI is always on, which is what every shop had before this existed.
 *
 * "My hours" are the selected days between start and end, in the merchant's
 * time zone. mode "outside" means the AI covers everything outside those hours
 * (the merchant answers during them); mode "during" means the AI only runs
 * inside them. A range whose end is before its start runs overnight and
 * belongs to the day it starts on.
 */

export const REPLY_SCHEDULE_MODES = ["outside", "during"];
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DEFAULT_REPLY_SCHEDULE = Object.freeze({
  enabled: false,
  mode: "outside",
  timezone: "UTC",
  days: [1, 2, 3, 4, 5],
  start: "09:00",
  end: "17:00",
});

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toMinutes(hhmm) {
  const m = TIME_RE.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Coerce anything (db value, form input) into a valid schedule. */
export function normalizeReplySchedule(raw) {
  const d = DEFAULT_REPLY_SCHEDULE;
  if (!raw || typeof raw !== "object") return { ...d, days: [...d.days] };
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
    : [...d.days];
  return {
    enabled: raw.enabled === true,
    mode: REPLY_SCHEDULE_MODES.includes(raw.mode) ? raw.mode : d.mode,
    timezone: isValidTimeZone(raw.timezone) ? raw.timezone : d.timezone,
    days,
    start: TIME_RE.test(raw.start) ? raw.start : d.start,
    end: TIME_RE.test(raw.end) ? raw.end : d.end,
  };
}

/** Day of week (0 = Sunday) and minutes since midnight at `now` in `tz`. */
export function localDayAndMinutes(now, tz) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    day: DAY_LABELS.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** True when `now` falls inside the merchant's hours. */
export function isWithinHours(schedule, now = new Date()) {
  const s = normalizeReplySchedule(schedule);
  if (s.days.length === 0) return false;
  const { day, minutes } = localDayAndMinutes(now, s.timezone);
  const start = toMinutes(s.start);
  const end = toMinutes(s.end);
  const has = (d) => s.days.includes(d);
  if (start === end) return has(day);
  if (start < end) return has(day) && minutes >= start && minutes < end;
  const yesterday = (day + 6) % 7;
  return (has(day) && minutes >= start) || (has(yesterday) && minutes < end);
}

/** Whether the AI may reply at `now`. Always true without an enabled schedule. */
export function isAutomationScheduledOn(schedule, now = new Date()) {
  const s = normalizeReplySchedule(schedule);
  if (!s.enabled) return true;
  const inside = isWithinHours(s, now);
  return s.mode === "during" ? inside : !inside;
}
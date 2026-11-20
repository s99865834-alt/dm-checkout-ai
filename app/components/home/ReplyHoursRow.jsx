import { useEffect, useState } from "react";
import { DAY_LABELS, DEFAULT_REPLY_SCHEDULE, isAutomationScheduledOn } from "../../lib/reply-schedule";

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * "Reply hours" row in the Home automation settings. Edits a schedule object
 * that the parent posts as JSON with the rest of the form on Save.
 */
export function ReplyHoursRow({ schedule, onChange }) {
  // The zone list differs slightly between Node and browsers, so it is only
  // filled in after mount to keep server and client markup identical.
  const [zones, setZones] = useState([schedule.timezone]);
  const [onNow, setOnNow] = useState(null);

  useEffect(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    setZones([...new Set([schedule.timezone, ...all])].sort());
  }, [schedule.timezone]);

  useEffect(() => {
    setOnNow(isAutomationScheduledOn(schedule));
  }, [schedule]);

  const set = (patch) => onChange({ ...schedule, ...patch });

  const toggleEnabled = (enabled) => {
    // A schedule that was never saved still carries the UTC placeholder;
    // the merchant's own zone is the right starting point.
    const neverSaved = schedule.timezone === DEFAULT_REPLY_SCHEDULE.timezone;
    set(enabled && neverSaved ? { enabled, timezone: browserTimeZone() } : { enabled });
  };

  const toggleDay = (day) => {
    const days = schedule.days.includes(day)
      ? schedule.days.filter((d) => d !== day)
      : [...schedule.days, day].sort();
    set({ days });
  };

  return (
    <div className="srToggleRow srToggleRowLast">
      <div className="srToggleRowInner">
        <div className="srToggleRowText">
          <span className="srCardTitle">Reply hours</span>
          <span className="srCardDesc">
            {schedule.enabled
              ? "The AI only replies when your schedule allows. Messages that arrive while it is paused are saved but not answered, and Instagram only lets you reply within 24 hours."
              : "The AI replies around the clock. Turn this on to choose when it covers for you."}
          </span>
        </div>
        <label className="srToggle" aria-label="Reply hours">
          <input type="checkbox" checked={schedule.enabled} onChange={(e) => toggleEnabled(e.target.checked)} />
          <span className="srToggleTrack"><span className="srToggleThumb" /></span>
        </label>
      </div>

      {schedule.enabled && (
        <div className="srReplyHours">
          <select
            value={schedule.mode}
            onChange={(e) => set({ mode: e.target.value })}
            className="srSelect"
            aria-label="When the AI replies"
          >
            <option value="outside">AI replies outside my hours</option>
            <option value="during">AI replies only during my hours</option>
          </select>

          <div className="srReplyHoursLabel">My hours</div>
          <div className="srReplyDays" role="group" aria-label="Days">
            {DAY_LABELS.map((label, day) => (
              <button
                key={label}
                type="button"
                className="srReplyDay"
                aria-pressed={schedule.days.includes(day)}
                onClick={() => toggleDay(day)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="srReplyTimes">
            <input
              type="time"
              value={schedule.start}
              onChange={(e) => e.target.value && set({ start: e.target.value })}
              className="srInput"
              aria-label="Start time"
            />
            <span>to</span>
            <input
              type="time"
              value={schedule.end}
              onChange={(e) => e.target.value && set({ end: e.target.value })}
              className="srInput"
              aria-label="End time"
            />
          </div>

          <select
            value={schedule.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            className="srSelect"
            aria-label="Time zone"
          >
            {zones.map((z) => (
              <option key={z} value={z}>{z.replace(/_/g, " ")}</option>
            ))}
          </select>

          {schedule.days.length === 0 ? (
            <span className="srCardDesc srReplyHoursWarn">Pick at least one day.</span>
          ) : (
            onNow !== null && (
              <span className="srCardDesc">
                {onNow ? "With this schedule the AI is replying right now." : "With this schedule the AI is paused right now."}
                {" "}An end time earlier than the start runs overnight.
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}

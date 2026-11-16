import { describe, it, expect } from "vitest";
import {
  effectivePlan,
  commentTrialStatus,
  freePlanStatus,
  COMMENT_TRIAL_DAYS,
  COMMENT_TRIAL_CAP,
  FREE_PLAN_CLOSED_AT,
  FREE_PLAN_ENDS_AT,
} from "../app/lib/entitlements";
import { getPlanConfig, PLANS } from "../app/lib/plans";

// Inside the Free retirement notice period, so these cover Free as it still
// works for shops installed before FREE_PLAN_CLOSED_AT.
const NOW = Date.parse("2026-11-20T00:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const legacy = (shop = {}) => ({ created_at: "2026-10-01T00:00:00Z", ...shop });

describe("commentTrialStatus", () => {
  it("reports not started when Instagram has never been connected", () => {
    const s = commentTrialStatus({ comment_trial_started_at: null }, NOW);
    expect(s).toMatchObject({ started: false, active: false, daysLeft: 0 });
  });

  it("is active inside the window with days remaining", () => {
    const s = commentTrialStatus({ comment_trial_started_at: daysAgo(3) }, NOW);
    expect(s.active).toBe(true);
    expect(s.daysLeft).toBe(COMMENT_TRIAL_DAYS - 3);
  });

  it("is inactive once the window has passed", () => {
    const s = commentTrialStatus({ comment_trial_started_at: daysAgo(COMMENT_TRIAL_DAYS + 1) }, NOW);
    expect(s).toMatchObject({ started: true, active: false, daysLeft: 0 });
  });

  it("treats a missing shop as not started rather than throwing", () => {
    expect(commentTrialStatus(null, NOW).started).toBe(false);
    expect(commentTrialStatus(undefined, NOW).started).toBe(false);
  });
});

describe("effectivePlan", () => {
  it("opens the Growth selling loop for Free inside the window", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), legacy({ comment_trial_started_at: daysAgo(1) }), NOW);
    expect(plan.comments).toBe(true);
    expect(plan.converse).toBe(true);
    expect(plan.brandVoice).toBe(true);
    expect(plan.followup).toBe(false);
    expect(plan.stories).toBe(false);
    expect(plan.defaultProduct).toBe(false);
    expect(plan.commentTrial.granting).toBe(true);
    expect(plan.commentTrial.expired).toBe(false);
  });

  it("closes the Growth selling loop for Free once the window expires, and flags it", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), legacy({ comment_trial_started_at: daysAgo(99) }), NOW);
    expect(plan.comments).toBe(false);
    expect(plan.converse).toBe(false);
    expect(plan.brandVoice).toBe(false);
    expect(plan.commentTrial.granting).toBe(false);
    // Drives the upgrade prompt: they have now seen it work.
    expect(plan.commentTrial.expired).toBe(true);
  });

  it("leaves Free without the Growth selling loop when Instagram was never connected", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), legacy({}), NOW);
    expect(plan.comments).toBe(false);
    expect(plan.converse).toBe(false);
    expect(plan.brandVoice).toBe(false);
    expect(plan.commentTrial.expired).toBe(false);
  });

  it("never marks a paid plan as trial-granted, even mid-window", () => {
    for (const name of ["GROWTH", "PRO"]) {
      const plan = effectivePlan(getPlanConfig(name), { comment_trial_started_at: daysAgo(1) }, NOW);
      expect(plan.comments).toBe(true);
      expect(plan.converse).toBe(true);
      expect(plan.brandVoice).toBe(true);
      // Paid comments are not time-limited; the UI must not show a countdown.
      expect(plan.commentTrial.granting).toBe(false);
      expect(plan.commentTrial.expired).toBe(false);
    }
  });

  // A 25-message cap shared between DMs and comments would end the window on
  // volume in a couple of days for a store taking 274 comments a month, making the
  // 14-day promise false for the merchants it targets.
  it("lifts the Free cap while the window is open", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), legacy({ comment_trial_started_at: daysAgo(1) }), NOW);
    expect(plan.cap).toBe(COMMENT_TRIAL_CAP);
    expect(COMMENT_TRIAL_CAP).toBeGreaterThan(PLANS.FREE.cap);
  });

  it("drops the Free cap back to normal once the window closes", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), legacy({ comment_trial_started_at: daysAgo(99) }), NOW);
    expect(plan.cap).toBe(PLANS.FREE.cap);
  });

  it("leaves the Free cap alone when Instagram was never connected", () => {
    expect(effectivePlan(getPlanConfig("FREE"), legacy({}), NOW).cap).toBe(PLANS.FREE.cap);
  });

  it("never lowers a paid cap toward the window allowance", () => {
    const plan = effectivePlan(getPlanConfig("GROWTH"), { comment_trial_started_at: daysAgo(1) });
    expect(plan.cap).toBe(PLANS.GROWTH.cap);
  });

  it("preserves every capability flag from the base plan", () => {
    const plan = effectivePlan(getPlanConfig("PRO"), {});
    for (const [key, value] of Object.entries(PLANS.PRO)) {
      expect(plan[key]).toEqual(value);
    }
  });

  it("accepts a plan name as well as a config object", () => {
    expect(effectivePlan("GROWTH", {}).cap).toBe(PLANS.GROWTH.cap);
    expect(effectivePlan(null, {}).name).toBe("FREE");
  });

  // meta_auth rows are deleted on disconnect, so the window start must live on
  // shops. If it were read from the auth row, a merchant could disconnect and
  // reconnect for unlimited free comment automation.
  it("does not reopen the window for a shop that reconnected Instagram", () => {
    const shop = { comment_trial_started_at: daysAgo(40) };
    expect(effectivePlan(getPlanConfig("FREE"), legacy(shop), NOW).comments).toBe(false);
    expect(effectivePlan(getPlanConfig("FREE"), legacy(shop), NOW).converse).toBe(false);
    expect(effectivePlan(getPlanConfig("FREE"), legacy(shop), NOW).brandVoice).toBe(false);
  });
});

describe("plan capability matrix", () => {
  it("gates stories to Pro only", () => {
    expect(PLANS.FREE.stories).toBe(false);
    expect(PLANS.GROWTH.stories).toBe(false);
    expect(PLANS.PRO.stories).toBe(true);
  });

  it("keeps Free's standing cap at a demo size", () => {
    expect(PLANS.FREE.cap).toBe(25);
    expect(PLANS.GROWTH.cap).toBeGreaterThan(PLANS.FREE.cap);
  });

  it("keeps Growth roomy enough that volume never forces a Pro upgrade", () => {
    // Pro is chosen for stories and follow-ups, not because 1,000 sends ran out.
    expect(PLANS.GROWTH.cap).toBeGreaterThanOrEqual(1000);
    expect(PLANS.PRO.cap).toBeGreaterThan(PLANS.GROWTH.cap);
    expect(PLANS.GROWTH.cap).toBeGreaterThan(PLANS.FREE.cap);
  });

  it("keeps follow-ups on Pro alone", () => {
    expect(PLANS.FREE.followup).toBe(false);
    expect(PLANS.GROWTH.followup).toBe(false);
    expect(PLANS.PRO.followup).toBe(true);
  });
});

describe("Free plan retirement", () => {
  const AFTER_END = FREE_PLAN_ENDS_AT.getTime() + 60 * 1000;
  const newInstall = { created_at: new Date(FREE_PLAN_CLOSED_AT.getTime() + 60 * 1000).toISOString() };

  it("keeps Free working for shops installed before the cutoff until the end date", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), legacy(), NOW);
    expect(plan.locked).toBe(false);
    expect(plan.cap).toBe(PLANS.FREE.cap);
    expect(plan.freePlan.inGrace).toBe(true);
    expect(plan.freePlan.daysLeft).toBeGreaterThan(0);
  });

  it("locks those shops once the end date passes, even mid comment window", () => {
    const plan = effectivePlan(
      getPlanConfig("FREE"),
      legacy({ comment_trial_started_at: new Date(AFTER_END - 2 * 24 * 60 * 60 * 1000).toISOString() }),
      AFTER_END,
    );
    expect(plan.locked).toBe(true);
    expect(plan.cap).toBe(0);
    expect(plan.comments).toBe(false);
    expect(plan.converse).toBe(false);
    expect(plan.brandVoice).toBe(false);
    expect(plan.commentTrial.granting).toBe(false);
  });

  it("gives shops installed after the cutoff no Free at all", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), newInstall, NOW);
    expect(plan.locked).toBe(true);
    expect(plan.cap).toBe(0);
  });

  it("locks a Free shop whose install date is unknown", () => {
    expect(effectivePlan(getPlanConfig("FREE"), {}, NOW).locked).toBe(true);
    expect(freePlanStatus(null, NOW).locked).toBe(true);
  });

  it("never locks Basic or Pro, before or after the end date", () => {
    for (const name of ["GROWTH", "PRO"]) {
      for (const now of [NOW, AFTER_END]) {
        const plan = effectivePlan(getPlanConfig(name), newInstall, now);
        expect(plan.locked).toBe(false);
        expect(plan.cap).toBe(PLANS[name].cap);
      }
    }
  });

  it("ends the notice period after the end date it announces", () => {
    expect(FREE_PLAN_ENDS_AT.getTime()).toBeGreaterThan(FREE_PLAN_CLOSED_AT.getTime());
  });
});

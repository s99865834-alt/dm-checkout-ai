import { describe, it, expect } from "vitest";
import { effectivePlan, commentTrialStatus, COMMENT_TRIAL_DAYS } from "../app/lib/entitlements";
import { getPlanConfig, PLANS } from "../app/lib/plans";

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

describe("commentTrialStatus", () => {
  it("reports not started when Instagram has never been connected", () => {
    const s = commentTrialStatus({ comment_trial_started_at: null });
    expect(s).toMatchObject({ started: false, active: false, daysLeft: 0 });
  });

  it("is active inside the window with days remaining", () => {
    const s = commentTrialStatus({ comment_trial_started_at: daysAgo(3) });
    expect(s.active).toBe(true);
    expect(s.daysLeft).toBe(COMMENT_TRIAL_DAYS - 3);
  });

  it("is inactive once the window has passed", () => {
    const s = commentTrialStatus({ comment_trial_started_at: daysAgo(COMMENT_TRIAL_DAYS + 1) });
    expect(s).toMatchObject({ started: true, active: false, daysLeft: 0 });
  });

  it("treats a missing shop as not started rather than throwing", () => {
    expect(commentTrialStatus(null).started).toBe(false);
    expect(commentTrialStatus(undefined).started).toBe(false);
  });
});

describe("effectivePlan", () => {
  it("opens comments for Free inside the window", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), { comment_trial_started_at: daysAgo(1) });
    expect(plan.comments).toBe(true);
    expect(plan.commentTrial.granting).toBe(true);
    expect(plan.commentTrial.expired).toBe(false);
  });

  it("closes comments for Free once the window expires, and flags it", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), { comment_trial_started_at: daysAgo(99) });
    expect(plan.comments).toBe(false);
    expect(plan.commentTrial.granting).toBe(false);
    // Drives the upgrade prompt: they have now seen it work.
    expect(plan.commentTrial.expired).toBe(true);
  });

  it("leaves Free without comments when Instagram was never connected", () => {
    const plan = effectivePlan(getPlanConfig("FREE"), {});
    expect(plan.comments).toBe(false);
    expect(plan.commentTrial.expired).toBe(false);
  });

  it("never marks a paid plan as trial-granted, even mid-window", () => {
    for (const name of ["GROWTH", "PRO"]) {
      const plan = effectivePlan(getPlanConfig(name), { comment_trial_started_at: daysAgo(1) });
      expect(plan.comments).toBe(true);
      // Paid comments are not time-limited; the UI must not show a countdown.
      expect(plan.commentTrial.granting).toBe(false);
      expect(plan.commentTrial.expired).toBe(false);
    }
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
    expect(effectivePlan(getPlanConfig("FREE"), shop).comments).toBe(false);
  });
});

describe("plan capability matrix", () => {
  it("gates stories to Pro only", () => {
    expect(PLANS.FREE.stories).toBe(false);
    expect(PLANS.GROWTH.stories).toBe(false);
    expect(PLANS.PRO.stories).toBe(true);
  });

  it("keeps Growth roomy enough that volume never forces a Pro upgrade", () => {
    // Busiest live store runs ~95 sends/month; Growth must clear that with
    // room so Pro is chosen for features, not headroom.
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

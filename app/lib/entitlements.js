/**
 * Effective plan capabilities.
 *
 * A merchant's raw plan is not the whole story: Free gets a one-time window
 * where Growth's selling loop is switched on (comments, multi-turn, brand
 * voice). That exists because the paywall used to be invisible: one live store
 * took 326 comments over five weeks, every one dropped by the plan gate with
 * no banner and no error, concluded the app was broken, and installed a
 * competitor. Nobody upgrades to a feature they have never seen work.
 *
 * The window used to grant comments only. A comment-to-DM that cannot continue
 * the conversation is a broken demo: the shopper asks a size, the AI goes
 * silent, and the merchant jumps in. entitlements.js now grants the full Growth
 * selling loop so day 15 is losing something that actually closed, not a
 * one-shot DM.
 *
 * Everything that decides "can this shop reply to comments / continue a
 * thread / use brand voice?" must go through effectivePlan() so the UI and
 * the automation pipeline cannot disagree.
 *
 * No .server suffix: the UI imports this too.
 */

import { getPlanConfig } from "./plans";

export const COMMENT_TRIAL_DAYS = 14;

/**
 * Message allowance while the window is open.
 *
 * Free's standing cap of 25 is a single budget shared by DMs and comments, and
 * the stores this window exists for run far past it. Left at 25 the window
 * would end on volume in a couple of days, so "free for 14 days" would be
 * false for exactly the merchants who most need to see it work. Reverts to
 * 25 the moment the window closes.
 */
export const COMMENT_TRIAL_CAP = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * State of the free comment window for a shop.
 *
 * Anchored to shops.comment_trial_started_at, which is written once when
 * Instagram is first connected and never reset. It deliberately does NOT live
 * on meta_auth: those rows are deleted on disconnect, so a merchant could
 * reconnect for a fresh window indefinitely.
 *
 * @param {Object|null} shop - shops row
 * @returns {{started: boolean, active: boolean, daysLeft: number, endsAt: Date|null}}
 */
export function commentTrialStatus(shop) {
  const startedAt = shop?.comment_trial_started_at;
  if (!startedAt) {
    return { started: false, active: false, daysLeft: 0, endsAt: null };
  }

  const endsAt = new Date(new Date(startedAt).getTime() + COMMENT_TRIAL_DAYS * DAY_MS);
  const msLeft = endsAt.getTime() - Date.now();

  return {
    started: true,
    active: msLeft > 0,
    daysLeft: msLeft > 0 ? Math.ceil(msLeft / DAY_MS) : 0,
    endsAt,
  };
}

/**
 * Plan config with any trial overrides applied.
 *
 * Returns the same shape as getPlanConfig plus trial metadata, so existing
 * `plan.comments` / `plan.cap` / `plan.stories` reads keep working unchanged.
 *
 * @param {Object|string|null} plan - plan config object or plan name
 * @param {Object|null} shop - shops row (needs comment_trial_started_at)
 */
export function effectivePlan(plan, shop) {
  const base = typeof plan === "string" || !plan ? getPlanConfig(plan) : plan;
  const trial = commentTrialStatus(shop);

  // Only Free is ever upgraded by the window. Paid plans already have these.
  // Stories, follow-ups, and default product stay Pro: the window is a Growth
  // demo, not a Pro demo.
  const trialGrantsGrowth = base.name === "FREE" && trial.active;

  return {
    ...base,
    comments: base.comments || trialGrantsGrowth,
    converse: base.converse || trialGrantsGrowth,
    brandVoice: base.brandVoice || trialGrantsGrowth,
    // Never lower an existing cap, only raise it for the window.
    cap: trialGrantsGrowth ? Math.max(base.cap, COMMENT_TRIAL_CAP) : base.cap,
    commentTrial: {
      ...trial,
      // True only while the window is what's providing access, so the UI can
      // show a countdown without implying paid plans are time-limited.
      granting: trialGrantsGrowth,
      // True once a Free shop's window has closed: the moment to ask for the
      // upgrade, because now they have seen it work.
      expired: base.name === "FREE" && trial.started && !trial.active,
    },
  };
}

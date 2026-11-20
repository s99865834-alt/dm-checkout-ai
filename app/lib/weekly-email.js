/**
 * Weekly merchant email: who gets what. Pure, so every rule is testable.
 *
 * Each shop gets at most one email a week with one main message:
 *   connect - Instagram never connected. Capped, since most of these installs
 *             were abandoned and repeated nudges read as spam.
 *   setup   - connected, but no customer messages in 14 days.
 *   report  - customers messaged this week: what the AI did for them.
 * A report can carry one add-on: a review ask (only after real value) or an
 * upgrade suggestion (only when usage shows they are missing something). Never
 * both in one email, so we are not asking for a review and money at once.
 */

export const MAX_CONNECT_NUDGES = 3;
export const MAX_SETUP_CHECKS = 2;
export const MAX_REVIEW_ASKS = 3;
export const REVIEW_MIN_DAYS_INSTALLED = 14;
export const REVIEW_MIN_REPLIES_28D = 20;
export const REVIEW_GAP_WEEKS = 8;
export const UPSELL_GAP_WEEKS = 2;
export const UPSELL_MIN_STORY_MESSAGES = 3;
export const UPSELL_MIN_MISSED_COMMENTS = 3;
export const UPSELL_CAP_SHARE = 0.8;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tuesday from 15:00 UTC (8am Denver, 10am New York, 3pm London) through
 * Wednesday, so a deploy or restart on Tuesday still sends that week.
 */
export function isWeeklySendWindow(now = new Date()) {
  const day = now.getUTCDay();
  return (day === 2 && now.getUTCHours() >= 15) || day === 3;
}

/** Monday (UTC) of the week containing `date`, as YYYY-MM-DD. */
export function weekStartUtc(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The owner's inbox from stored store context. `ownerEmail` is Shopify's shop
 * email. Contexts saved before it existed kept that value in `email`, which
 * newer contexts reuse for the customer-facing address, so `email` only counts
 * when there is no emailSource.
 */
export function ownerEmailFromContext(ctx) {
  if (!ctx || typeof ctx !== "object") return null;
  const raw = ctx.ownerEmail || (!ctx.emailSource ? ctx.email : null);
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return EMAIL_RE.test(email) ? email : null;
}

export function normalizeStoreName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Reviewer store names from an App Store reviews page. */
export function parseReviewerNames(html) {
  const names = new Set();
  const re = /tw-text-heading-xs[^"]*"[^>]*>\s*<span[^>]*\btitle="([^"]+)"/g;
  for (const m of String(html || "").matchAll(re)) {
    const name = normalizeStoreName(m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
    if (name) names.add(name);
  }
  return names;
}

function weeksBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / (7 * DAY_MS));
}

/**
 * Upgrade worth suggesting, or null. Only from evidence in their own usage.
 * @returns {{to: "GROWTH"|"PRO", reason: "stories"|"cap"|"comments", count: number}|null}
 */
export function upsellFor(facts) {
  const plan = facts.plan || {};
  if (plan.name === "PRO") return null;
  if (!plan.stories && facts.storyThisMonth >= UPSELL_MIN_STORY_MESSAGES) {
    return { to: "PRO", reason: "stories", count: facts.storyThisMonth };
  }
  if (facts.cap > 0 && facts.usage >= facts.cap * UPSELL_CAP_SHARE) {
    return { to: plan.name === "GROWTH" ? "PRO" : "GROWTH", reason: "cap", count: facts.usage };
  }
  if (!plan.comments && facts.missedComments >= UPSELL_MIN_MISSED_COMMENTS) {
    return { to: "GROWTH", reason: "comments", count: facts.missedComments };
  }
  return null;
}

/**
 * Decide this week's email for one shop.
 * @param {object} facts - see weekly-email.server.js gatherFacts
 * @param {{week_start: string, kind: string, extras?: string[], status?: string}[]} history - newest first
 * @param {Date} now
 * @returns {{send: false, reason: string} | {send: true, kind: string, extras: string[], upsell: object|null}}
 */
export function planWeeklyEmail(facts, history = [], now = new Date()) {
  if (!facts.active) return { send: false, reason: "Uninstalled" };
  if (facts.isDevStore) return { send: false, reason: "Development store" };
  if (facts.isReviewShop) return { send: false, reason: "Shopify review store" };
  if (facts.optedOut) return { send: false, reason: "Unsubscribed" };
  if (!facts.email) return { send: false, reason: "No owner email" };

  const week = weekStartUtc(now);
  const sent = history.filter((h) => h.status !== "failed");
  if (sent.some((h) => h.week_start === week)) return { send: false, reason: "Already sent this week" };

  const count = (kind) => sent.filter((h) => h.kind === kind).length;

  if (!facts.igConnected) {
    if (count("connect") >= MAX_CONNECT_NUDGES) return { send: false, reason: "Connect reminders used up" };
    return { send: true, kind: "connect", extras: [], upsell: null };
  }

  const w = facts.week || {};
  if (!(w.received > 0)) {
    if (facts.last14Received > 0) return { send: false, reason: "Quiet week" };
    const lastReport = sent.findIndex((h) => h.kind === "report");
    const sinceReport = lastReport === -1 ? sent : sent.slice(0, lastReport);
    if (sinceReport.filter((h) => h.kind === "setup").length >= MAX_SETUP_CHECKS) {
      return { send: false, reason: "Setup checks used up" };
    }
    return { send: true, kind: "setup", extras: [], upsell: null };
  }

  const extras = [];
  let upsell = null;
  const lastExtra = (name) => sent.find((h) => (h.extras || []).includes(name));
  const installedDays = facts.installedAt ? (now - new Date(facts.installedAt)) / DAY_MS : 0;
  const earnedIt = facts.last28Responded >= REVIEW_MIN_REPLIES_28D || facts.ordersAllTime >= 1;
  const lastReview = lastExtra("review");
  // reviewed is null when the App Store could not be checked; then nobody is
  // asked, so a store that already reviewed is never asked again.
  const reviewDue =
    facts.reviewed === false &&
    installedDays >= REVIEW_MIN_DAYS_INSTALLED &&
    earnedIt &&
    sent.filter((h) => (h.extras || []).includes("review")).length < MAX_REVIEW_ASKS &&
    (!lastReview || weeksBetween(lastReview.week_start, week) >= REVIEW_GAP_WEEKS);

  if (reviewDue) {
    extras.push("review");
  } else {
    const lastUpsell = lastExtra("upsell");
    const candidate = upsellFor(facts);
    if (candidate && (!lastUpsell || weeksBetween(lastUpsell.week_start, week) >= UPSELL_GAP_WEEKS)) {
      extras.push("upsell");
      upsell = candidate;
    }
  }

  return { send: true, kind: "report", extras, upsell };
}

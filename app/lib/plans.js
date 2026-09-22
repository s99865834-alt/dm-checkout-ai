// Caps are a single shared budget across DMs and comments (see the identical
// check in both paths of automation.server.js).
//
// Free's 25 is a demo, not a place to live. The busiest real stores already
// run past that in a week, which is the point: after the 14-day window they
// either pay for Growth or go quiet. Growth sits at 1000 so volume never
// pushes a store onto Pro. Pro is chosen for stories and follow-ups.
//
// Every flag below is read by code and actually gates behaviour, with two
// deliberate exceptions, marked at each plan:
//
//   dm              - true everywhere, so there is nothing to gate. Kept
//                     because the billing comparison renders from this config.
//   prioritySupport - a promise about how fast Stephan answers email, not
//                     something software can enforce.
//
// If you add a flag, wire it to a gate in the same change. A flag nothing
// reads is worse than no flag: it reads like an enforced rule and isn't. The
// default product shipped that way and was inert for a week.
//
// Gate on the flag, never on `plan.name`. entitlements.js grants Growth
// selling capabilities on the Free comment window, so a FREE shop can
// legitimately have `comments: true` / `converse: true` / `brandVoice: true`,
// and a name comparison gets that wrong.
export const PLANS = {
  FREE: {
    name: "FREE",
    cap: 25,
    dm: true, // not gated: true on every plan
    // Comments, multi-turn, and brand voice are off on standing Free. A
    // one-time window can switch them on (see entitlements.js) so the merchant
    // feels Growth before being asked to pay for it.
    comments: false,
    converse: false,
    brandVoice: false,
    followup: false,
    stories: false,
    defaultProduct: false,
    // Single-use discount codes on checkout links. Gated in
    // discount-pool.server.js -> eligibleShops(), which is the only thing that
    // creates pools; no pool means claimDiscountCode returns null and the
    // reply goes out without a code.
    discounts: false,
    prioritySupport: false, // not gated: a human promise
  },
  GROWTH: {
    name: "GROWTH",
    cap: 1000,
    dm: true, // not gated: true on every plan
    comments: true,
    converse: true,
    brandVoice: true,
    followup: false,
    stories: false,
    defaultProduct: false,
    discounts: true,
    prioritySupport: false, // not gated: a human promise
  },
  PRO: {
    name: "PRO",
    cap: 10000,
    dm: true, // not gated: true on every plan
    comments: true,
    converse: true,
    brandVoice: true,
    followup: true,
    stories: true,
    // The product answered with when nothing else identifies one. Pairs with
    // stories: a story isn't in post_product_map and can't be, so without a
    // default there is nothing for a story reply to sell.
    defaultProduct: true,
    discounts: true,
    prioritySupport: true, // not gated: a human promise
  },
};

export function getPlanConfig(plan) {
  if (plan === "GROWTH" || plan === "PRO" || plan === "FREE") {
    return PLANS[plan];
  }
  return PLANS.FREE;
}

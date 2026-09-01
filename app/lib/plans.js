// Caps are a single shared budget across DMs and comments (see the identical
// check in both paths of automation.server.js). Growth sits at 1000 so that no
// realistic store is pushed onto Pro by volume alone: Pro is chosen for stories
// and follow-ups, not headroom. Observed usage for reference: the busiest live
// store runs ~95 sends/month.
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
// Gate on the flag, never on `plan.name`. entitlements.js grants capabilities
// on trial, so a FREE shop can legitimately have `comments: true`, and a name
// comparison gets that wrong.
export const PLANS = {
  FREE: {
    name: "FREE",
    cap: 100,
    dm: true, // not gated: true on every plan
    // Comments are off on Free, but a one-time trial window can switch them on
    // (see entitlements.js). Merchants who never see comment-to-DM work have no
    // reason to believe it does.
    comments: false,
    converse: false,
    brandVoice: false,
    followup: false,
    stories: false,
    defaultProduct: false,
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
    prioritySupport: true, // not gated: a human promise
  },
};

export function getPlanConfig(plan) {
  if (plan === "GROWTH" || plan === "PRO" || plan === "FREE") {
    return PLANS[plan];
  }
  return PLANS.FREE;
}


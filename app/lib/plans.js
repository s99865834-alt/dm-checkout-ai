// Caps are a single shared budget across DMs and comments (see the identical
// check in both paths of automation.server.js). Growth sits at 1000 so that no
// realistic store is pushed onto Pro by volume alone: Pro is chosen for stories
// and follow-ups, not headroom. Observed usage for reference: the busiest live
// store runs ~95 sends/month.
export const PLANS = {
  FREE: {
    name: "FREE",
    cap: 100,
    dm: true,
    // Comments are off on Free, but a one-time trial window can switch them on
    // (see entitlements.js). Merchants who never see comment-to-DM work have no
    // reason to believe it does.
    comments: false,
    converse: false,
    brandVoice: false,
    followup: false,
    stories: false,
    defaultProduct: false,
    prioritySupport: false,
  },
  GROWTH: {
    name: "GROWTH",
    cap: 1000,
    dm: true,
    comments: true,
    converse: true,
    brandVoice: true,
    followup: false,
    stories: false,
    defaultProduct: false,
    prioritySupport: false,
  },
  PRO: {
    name: "PRO",
    cap: 10000,
    dm: true,
    comments: true,
    converse: true,
    brandVoice: true,
    followup: true,
    stories: true,
    // The product answered with when nothing else identifies one. Pairs with
    // stories: a story isn't in post_product_map and can't be, so without a
    // default there is nothing for a story reply to sell.
    defaultProduct: true,
    prioritySupport: true,
  },
};

export function getPlanConfig(plan) {
  if (plan === "GROWTH" || plan === "PRO" || plan === "FREE") {
    return PLANS[plan];
  }
  return PLANS.FREE;
}


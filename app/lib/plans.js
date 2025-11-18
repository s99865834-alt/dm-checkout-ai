export const PLANS = {
  FREE: {
    name: "FREE",
    cap: 25,
    dm: true,
    comments: false,
    converse: false,
    brandVoice: false,
    remarketing: false,
    followup: false,
    prioritySupport: false,
  },
  GROWTH: {
    name: "GROWTH",
    cap: 500,
    dm: true,
    comments: true,
    converse: true,
    brandVoice: true,
    remarketing: false,
    followup: false,
    prioritySupport: false,
  },
  PRO: {
    name: "PRO",
    cap: 50000, // effectively unlimited w/ fair use
    dm: true,
    comments: true,
    converse: true,
    brandVoice: true,
    remarketing: true,
    followup: true,
    prioritySupport: true,
  },
};

export function getPlanConfig(plan) {
  if (plan === "GROWTH" || plan === "PRO" || plan === "FREE") {
    return PLANS[plan];
  }
  return PLANS.FREE;
}


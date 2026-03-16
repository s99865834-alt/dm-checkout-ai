export const PLANS = {
  FREE: {
    name: "FREE",
    cap: 100,
    dm: true,
    comments: false,
    converse: false,
    brandVoice: false,
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
    followup: false,
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
    prioritySupport: true,
  },
};

export function getPlanConfig(plan) {
  if (plan === "GROWTH" || plan === "PRO" || plan === "FREE") {
    return PLANS[plan];
  }
  return PLANS.FREE;
}


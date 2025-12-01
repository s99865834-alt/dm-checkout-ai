import { useOutletContext } from "react-router";

/**
 * PlanGate component - Shows upgrade prompt for locked features
 * 
 * Usage:
 * ```jsx
 * <PlanGate requiredPlan="GROWTH" feature="Comments Automation">
 *   <YourFeatureComponent />
 * </PlanGate>
 * ```
 * 
 * @param {Object} props
 * @param {string} props.requiredPlan - Required plan: "GROWTH" or "PRO"
 * @param {string} props.feature - Name of the feature (for the upgrade message)
 * @param {React.ReactNode} props.children - Content to show if plan allows
 */
export function PlanGate({ requiredPlan, feature, children }) {
  const { plan } = useOutletContext() || { plan: null };

  if (!plan) {
    return (
      <s-callout variant="warning">
        <s-text>Unable to load plan information. Please refresh the page.</s-text>
      </s-callout>
    );
  }

  const planHierarchy = { FREE: 0, GROWTH: 1, PRO: 2 };
  const currentPlanLevel = planHierarchy[plan.name] || 0;
  const requiredPlanLevel = planHierarchy[requiredPlan] || 0;

  if (currentPlanLevel >= requiredPlanLevel) {
    return <>{children}</>;
  }

  const planNames = {
    GROWTH: "Growth",
    PRO: "Pro",
  };

  const pricing = {
    GROWTH: "$29/month",
    PRO: "$99/month",
  };

  return (
    <s-callout variant="info" title={`${feature} requires ${planNames[requiredPlan]} plan`}>
      <s-stack direction="block" gap="base">
        <s-paragraph>
          <s-text>
            This feature is available on the <s-text variant="strong">{planNames[requiredPlan]}</s-text> plan ({pricing[requiredPlan]}).
          </s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text variant="subdued">
            Upgrade to unlock {feature} and other premium features.
          </s-text>
        </s-paragraph>
        <s-button href="/app/billing/select" variant="primary">
          Upgrade to {planNames[requiredPlan]}
        </s-button>
      </s-stack>
    </s-callout>
  );
}

/**
 * Hook to check if current plan has access to a feature
 * 
 * Usage:
 * ```jsx
 * const { hasAccess } = usePlanAccess();
 * if (hasAccess("GROWTH")) {
 *   // Show feature
 * }
 * ```
 */
export function usePlanAccess() {
  const { plan } = useOutletContext() || { plan: null };

  const planHierarchy = { FREE: 0, GROWTH: 1, PRO: 2 };

  const hasAccess = (requiredPlan) => {
    if (!plan) return false;
    const currentPlanLevel = planHierarchy[plan.name] || 0;
    const requiredPlanLevel = planHierarchy[requiredPlan] || 0;
    return currentPlanLevel >= requiredPlanLevel;
  };

  return {
    plan,
    hasAccess,
    isFree: plan?.name === "FREE",
    isGrowth: plan?.name === "GROWTH",
    isPro: plan?.name === "PRO",
  };
}


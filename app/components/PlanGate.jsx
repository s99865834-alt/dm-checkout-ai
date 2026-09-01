import { useOutletContext } from "react-router";

/**
 * PlanGate component - Shows upgrade prompt for locked features
 *
 * Prefer `capability`, which reads the flag on the effective plan, over
 * `requiredPlan`, which compares plan names. The two disagree whenever a trial
 * grants a capability the merchant's plan name doesn't include: the free
 * comment window turns on `comments` for a FREE shop, and a name comparison
 * locks the UI anyway. That exact mismatch already shipped once, telling
 * merchants to upgrade for a feature that was running for them at the time.
 *
 * Usage:
 * ```jsx
 * <PlanGate capability="brandVoice" feature="Brand Voice">
 *   <YourFeatureComponent />
 * </PlanGate>
 * ```
 *
 * @param {Object} props
 * @param {string} [props.capability] - Key on the plan config, e.g. "brandVoice"
 * @param {string} [props.requiredPlan] - Fallback: "GROWTH" or "PRO"
 * @param {string} props.feature - Name of the feature (for the upgrade message)
 * @param {React.ReactNode} props.children - Content to show if plan allows
 */
export function PlanGate({ capability, requiredPlan, feature, children }) {
  const { plan } = useOutletContext() || { plan: null };

  if (!plan) {
    return (
      <s-callout variant="warning">
        <s-text>Unable to load plan information. Please refresh the page.</s-text>
      </s-callout>
    );
  }

  const planHierarchy = { FREE: 0, GROWTH: 1, PRO: 2 };
  const allowed = capability
    ? plan[capability] === true
    : (planHierarchy[plan.name] || 0) >= (planHierarchy[requiredPlan] || 0);

  if (allowed) {
    return <>{children}</>;
  }

  return (
    <s-callout variant="info">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          <s-text variant="subdued">
            Upgrade to unlock {feature} and other premium features.
          </s-text>
        </s-paragraph>
        <s-button href="/app/billing/select" variant="primary">
          Upgrade
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


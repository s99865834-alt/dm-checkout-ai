/**
 * Mapping Shopify subscriptions onto our plan enum.
 *
 * Pure and dependency-free so it can be tested without Supabase or Shopify
 * credentials. billing.server.js owns the API calls; the decisions live here.
 *
 * The names matched below are configured in the Partner Dashboard, not in this
 * repo, so renaming a plan there silently stops it matching. That is why an
 * unrecognised name resolves to null ("leave the plan alone") instead of FREE.
 *
 * No .server suffix: safe to import anywhere.
 */

export const VALID_PLANS = new Set(["FREE", "GROWTH", "PRO"]);

/**
 * Map a Shopify Managed Pricing subscription to our internal plan enum.
 *
 * Returns:
 *   - "FREE" if there's no active subscription (the merchant is genuinely
 *     on the free tier)
 *   - "PRO" or "GROWTH" if the subscription name unambiguously matches
 *     (case-insensitive)
 *   - null if there IS an active subscription but its name doesn't map to one
 *     of our known plans. Callers MUST treat null as "I don't know, leave
 *     shop.plan alone" rather than silently downgrading.
 *
 * @param {Object|null} subscription - Result of getCurrentSubscription()
 * @returns {"FREE" | "GROWTH" | "PRO" | null}
 */
export function planFromSubscription(subscription) {
  if (!subscription || subscription.status !== "ACTIVE") return "FREE";
  const name = (subscription.name || "").toLowerCase();
  if (name.includes("pro")) return "PRO";
  if (name.includes("growth")) return "GROWTH";
  return null;
}

/**
 * Which plan an activation should write to shop.plan.
 *
 * The live subscription wins. Shopify appends a `plan` param to the return URL
 * after Managed Pricing approval, but that param arrives on a GET the merchant
 * can replay: letting it outrank the subscription meant anyone holding an
 * active Growth subscription could visit the activation URL with ?plan=PRO and
 * grant themselves Pro capabilities for $39. It is now only consulted when the
 * subscription name doesn't map to a plan we recognise, which is the case it
 * was there to cover.
 *
 * @param {Object|null} subscription - Result of getCurrentSubscription()
 * @param {string|null} planParam - The `plan` query param, if present
 * @returns {"FREE" | "GROWTH" | "PRO" | null} null means "leave shop.plan alone"
 */
export function resolveActivationPlan(subscription, planParam) {
  const fromSubscription = planFromSubscription(subscription);
  if (fromSubscription) return fromSubscription;

  const normalized = (planParam || "").toUpperCase();
  return VALID_PLANS.has(normalized) ? normalized : null;
}

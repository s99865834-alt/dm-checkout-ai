/**
 * What a Postmark webhook event means for the weekly email.
 * @returns {{action: "optout", reason: string} | {action: "optin"} | null}
 */
export function subscriptionEffect(event) {
  if (!event || typeof event !== "object") return null;
  if (event.RecordType === "SpamComplaint") return { action: "optout", reason: "spam_complaint" };
  if (event.RecordType === "Bounce" && event.Type === "HardBounce") return { action: "optout", reason: "hard_bounce" };
  if (event.RecordType === "SubscriptionChange") {
    if (event.SuppressSending === true) return { action: "optout", reason: "postmark_unsubscribe" };
    if (event.SuppressSending === false) return { action: "optin" };
  }
  return null;
}

// Postmark puts its own unsubscribe link wherever this appears, and appends a
// second one at the bottom of any broadcast that lacks it.
export const POSTMARK_UNSUBSCRIBE_PLACEHOLDER = "{{{ pm:unsubscribe }}}";

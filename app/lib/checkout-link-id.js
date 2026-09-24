/**
 * Checkout / add-to-cart links use a bare 8-char base62 id (generateLinkId).
 * Analytics CTR only counts those. Revenue attribution is wider: any
 * link_id that was last-clicked (or used via a discount code) inside 30 days
 * can credit a sale, including info_ and pdp_ destinations.
 *   dm_reply_*  claim slot (no URL)
 *   info_*      homepage / collection / browse
 *   pdp_*       product page
 *   size_q_*    size-question reply
 *   followup_*  check-in DM
 */
export function isCheckoutLinkId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9]{8}$/.test(id);
}

/**
 * Checkout / add-to-cart links use a bare 8-char base62 id (generateLinkId).
 * Everything else in links_sent is bookkeeping or a non-checkout destination
 * and must not count toward analytics or attribution:
 *   dm_reply_*  claim slot (no URL)
 *   info_*      homepage / browse-the-store
 *   pdp_*       product page (no cart attribute)
 *   size_q_*    size-question reply
 *   followup_*  check-in DM
 */
export function isCheckoutLinkId(id) {
  return typeof id === "string" && /^[a-zA-Z0-9]{8}$/.test(id);
}

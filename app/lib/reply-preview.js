/**
 * Decisions for the pre-connection reply preview.
 *
 * Pure and dependency-free so it can be tested without Supabase or OpenAI
 * credentials. reply-preview.server.js owns the model call and the database
 * write; the wording and the analytics contract live here.
 *
 * No .server suffix: safe to import anywhere.
 */

/**
 * Marks a links_sent row as not real traffic.
 *
 * shop_analytics_totals scopes its links on `ls.failed_reason is null`, so any
 * non-null value keeps a preview out of "checkout links sent". The redirect
 * lookup in click-redirect.server.js selects on link_id alone, so the link
 * still resolves and the merchant can click through to a real checkout.
 */
export const PREVIEW_FAILED_REASON = "preview";

const GENERIC_QUESTION = "What do you sell?";

// Shopify ships a "Gift Card" product on most stores and it sorts first, which
// made it the default pick. It is the worst possible demo: the agent correctly
// asks which denomination the customer wants instead of minting a link, so the
// preview produced a reply with nothing to click, which is the exact weakness
// this card exists to fix. Skipped in favour of something with a price.
const POOR_DEMO_TITLE = /gift\s*card/i;

function usableTitle(product) {
  const title = typeof product?.title === "string" ? product.title.trim() : "";
  return title !== "" ? title : null;
}

/**
 * A question worth pre-filling, using a product the merchant actually stocks.
 *
 * Reads the products already cached on shops.store_context_json at install
 * (five titles, fetched about five seconds after OAuth), so this costs no API
 * call and works before Instagram is connected.
 *
 * A price question is the right default: it is the highest-intent thing a real
 * customer sends, and it exercises catalogue lookup and checkout-link minting,
 * which is the part worth seeing.
 *
 * @param {Object|null} storeContext - shops.store_context_json
 * @returns {string}
 */
export function suggestedPreviewQuestion(storeContext) {
  const products = Array.isArray(storeContext?.products) ? storeContext.products : [];
  const titles = products.map(usableTitle).filter(Boolean);
  // Prefer a real product, but a gift card still beats asking nothing specific
  // on a store that only stocks one.
  const title = titles.find((t) => !POOR_DEMO_TITLE.test(t)) || titles[0];
  if (!title) return GENERIC_QUESTION;
  return `How much is the ${title}?`;
}

/**
 * Whether a shop is a Shopify development store.
 *
 * @param {Object} admin - Authenticated Shopify admin API client
 * @returns {Promise<boolean|null>} null when Shopify could not be asked
 */
export async function fetchIsDevStore(admin) {
  try {
    const response = await admin.graphql(`query ShopIsDevStore { shop { plan { partnerDevelopment } } }`);
    const json = await response.json();
    const value = json?.data?.shop?.plan?.partnerDevelopment;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

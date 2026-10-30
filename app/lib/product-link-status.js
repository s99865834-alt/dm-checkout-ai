/**
 * What a link to a product will actually open, decided from its Admin API
 * `Product` node before the link is sent.
 *
 * A cart permalink to a deleted, unpublished, or sold-out variant opens
 * Shopify's "Link no longer exists" page, and a product page for a deleted or
 * draft product is a 404. Both look like the app is broken.
 *
 *   ok            checkout permalink to `variantId` works
 *   product_page  the product page opens, but checkout would not
 *   gone          nothing about this product opens; only the catalog is safe
 */

const numericId = (id) => String(id ?? "").match(/(\d+)$/)?.[1] || "";

// Matches the `variants(first: 100)` in the status query.
const VARIANT_PAGE = 100;

/**
 * @param {object|null} node - Product node from the status query, null when deleted
 * @param {string|null} variantId - mapped variant, gid or numeric
 * @returns {{state: "ok"|"product_page"|"gone", reason: string|null, variantId: string|null, handle: string|null}}
 */
export function productLinkStatus(node, variantId = null) {
  if (!node?.id) return { state: "gone", reason: "deleted", variantId: null, handle: null };
  const handle = node.handle || null;
  if (node.status !== "ACTIVE") {
    return { state: "gone", reason: "unpublished", variantId: null, handle };
  }
  // Not onlineStoreUrl: it comes back null for products that are published to
  // Online Store when the storefront is password protected.
  if (!node.publishedAt) {
    return { state: "gone", reason: "not_on_online_store", variantId: null, handle };
  }

  const variants = node.variants?.nodes || [];
  if (variantId) {
    const wanted = numericId(variantId);
    const match = variants.find((v) => numericId(v.id) === wanted);
    if (match?.availableForSale) return { state: "ok", reason: null, variantId: match.id, handle };
    // Past the first page we cannot see it, which is not evidence it is gone.
    if (!match && variants.length >= VARIANT_PAGE) {
      return { state: "ok", reason: null, variantId: `gid://shopify/ProductVariant/${wanted}`, handle };
    }
    // Never swap in a different variant: a customer who asked about the large
    // one should not land in checkout with the small one.
    return {
      state: "product_page",
      reason: match ? "variant_sold_out" : "variant_deleted",
      variantId: null,
      handle,
    };
  }

  const firstAvailable = variants.find((v) => v.availableForSale);
  if (firstAvailable) return { state: "ok", reason: null, variantId: firstAvailable.id, handle };
  return { state: "product_page", reason: "sold_out", variantId: null, handle };
}

/**
 * Merchant-facing explanation for a mapping whose link will not check out.
 * @param {object|null} status - from productLinkStatus
 * @param {"post"|"default"} [target] - a mapped post, or the default product
 */
export function mappingProblemText(status, target = "post") {
  if (!status || status.state === "ok") return null;
  const repick = target === "default" ? "Pick another default product below." : "Map this post to another product.";
  const repickVariant = target === "default" ? "Pick a current variant below." : "Remap this post to pick a current variant.";
  switch (status.reason) {
    case "deleted":
      return `This product was deleted from your store. Customers get your catalog link instead. ${repick}`;
    case "unpublished":
      return `This product is a draft or archived, so its page doesn't open. Customers get your catalog link instead. Make it active, or ${repick.charAt(0).toLowerCase()}${repick.slice(1)}`;
    case "not_on_online_store":
      return "This product isn't available on your Online Store, so its page doesn't open. Customers get your catalog link instead.";
    case "variant_deleted":
      return `The variant you picked no longer exists. Customers get the product page instead of checkout. ${repickVariant}`;
    case "variant_sold_out":
      return "The variant you picked is sold out. Customers get the product page instead of checkout until it's back in stock.";
    case "sold_out":
      return "This product is sold out. Customers get the product page instead of checkout until it's back in stock.";
    default:
      return null;
  }
}

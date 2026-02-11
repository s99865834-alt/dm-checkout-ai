/**
 * Shopify Data Fetching
 * Fetches store information, policies, products, etc. for AI responses
 */

import { sessionStorage } from "../shopify.server";
import shopify from "../shopify.server";

async function loadShopSession(shopDomain) {
  if (!shopDomain) return null;

  // Preferred: app-session format used by this codebase
  const sessionId = `${shopDomain}_${process.env.SHOPIFY_API_KEY}`;
  let session = await sessionStorage.loadSession(sessionId);
  if (session?.accessToken) return session;

  // Fallback: offline session if available
  const offlineId = `offline_${shopDomain}`;
  session = await sessionStorage.loadSession(offlineId);
  if (session?.accessToken) return session;

  // Fallback: any session for shop
  if (typeof sessionStorage.findSessionsByShop === "function") {
    const sessions = await sessionStorage.findSessionsByShop(shopDomain);
    const candidate = sessions?.find((s) => s?.accessToken) || sessions?.[0];
    if (candidate?.accessToken) return candidate;
  }

  return null;
}

/**
 * Get Shopify store information including policies using shop domain
 * @param {string} shopDomain - Shop domain (e.g., "example.myshopify.com")
 * @returns {Promise<Object>} - Store information including policies
 */
export async function getShopifyStoreInfo(shopDomain) {
  try {
    if (!shopDomain) {
      console.log("[shopify-data] No shop domain provided, skipping store info fetch");
      return null;
    }
    
    const session = await loadShopSession(shopDomain);
    
    if (!session || !session.accessToken) {
      console.error("[shopify-data] No valid session found for shop:", shopDomain);
      return null;
    }
    
    // Create GraphQL client using the session
    const admin = new shopify.clients.Graphql({ session });
    
    // Fetch shop information and policies
    const response = await admin.graphql(`
      query getShopInfo {
        shop {
          name
          email
          description
          primaryDomain {
            url
            host
          }
          refundPolicy {
            title
            body
            url
          }
          privacyPolicy {
            title
            body
            url
          }
          termsOfService {
            title
            body
            url
          }
          shippingPolicy {
            title
            body
            url
          }
        }
        pages(first: 10) {
          nodes {
            title
            handle
            onlineStoreUrl
          }
        }
        products(first: 5, sortKey: BEST_SELLING) {
          nodes {
            title
            handle
            onlineStoreUrl
          }
        }
      }
    `);

    const shopData = response?.data?.shop;
    const pages = response?.data?.pages?.nodes || [];
    const products = response?.data?.products?.nodes || [];
    return {
      name: shopData?.name || null,
      email: shopData?.email || null,
      description: shopData?.description || null,
      primaryDomain: shopData?.primaryDomain || null,
      refundPolicy: shopData?.refundPolicy || null,
      privacyPolicy: shopData?.privacyPolicy || null,
      termsOfService: shopData?.termsOfService || null,
      shippingPolicy: shopData?.shippingPolicy || null,
      pages,
      products,
    };
  } catch (error) {
    console.error("[shopify-data] Error fetching store info:", error);
    return null;
  }
}

/**
 * Get product name and price by product/variant ID.
 * @param {string} shopDomain - Shop domain (e.g., "example.myshopify.com")
 * @param {string} productId - Shopify product GID
 * @param {string|null} variantId - Shopify variant GID (optional)
 * @returns {Promise<{productName: string|null, productPrice: string|null}>}
 */
export async function getShopifyProductInfo(shopDomain, productId, variantId = null) {
  try {
    if (!shopDomain || !productId) {
      return { productName: null, productPrice: null };
    }

    const session = await loadShopSession(shopDomain);
    if (!session || !session.accessToken) {
      console.error("[shopify-data] No valid session found for shop:", shopDomain);
      return { productName: null, productPrice: null };
    }

    const admin = new shopify.clients.Graphql({ session });
    const response = await admin.graphql(`
      query getProductInfo($productId: ID!, $variantId: ID) {
        product(id: $productId) {
          title
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
        productVariant(id: $variantId) {
          price
        }
      }
    `, {
      variables: { productId, variantId },
    });

    const json = await response.json();
    const product = json?.data?.product || null;
    const variant = json?.data?.productVariant || null;

    const productName = product?.title || null;
    let productPrice = null;

    if (variant?.price) {
      productPrice = variant.price;
    } else if (product?.priceRangeV2?.minVariantPrice?.amount) {
      const amount = product.priceRangeV2.minVariantPrice.amount;
      const currency = product.priceRangeV2.minVariantPrice.currencyCode;
      productPrice = currency ? `${amount} ${currency}` : String(amount);
    }

    return { productName, productPrice };
  } catch (error) {
    console.error("[shopify-data] Error fetching product info:", error);
    return { productName: null, productPrice: null };
  }
}

/**
 * Search for products by name or handle
 * @param {Object} request - Request object (for authentication)
 * @param {string} searchTerm - Search term (product name, handle, etc.)
 * @param {number} limit - Maximum number of products to return (default: 5)
 * @returns {Promise<Array>} - Array of matching products
 */
export async function searchShopifyProducts(request, searchTerm, limit = 5) {
  try {
    const { authenticate } = await import("../shopify.server");
    const { admin } = await authenticate.admin(request);
    
    const response = await admin.graphql(`
      query searchProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query) {
          nodes {
            id
            title
            handle
            description
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            variants(first: 5) {
              nodes {
                id
                title
                price
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    `, {
      variables: {
        query: `title:*${searchTerm}* OR handle:*${searchTerm}*`,
        first: limit,
      },
    });

    return response?.data?.products?.nodes || [];
  } catch (error) {
    console.error("[shopify-data] Error searching products:", error);
    return [];
  }
}

/**
 * Get active discounts/sales
 * @param {Object} request - Request object (for authentication)
 * @returns {Promise<Array>} - Array of active discount codes
 */
export async function getActiveDiscounts(request) {
  try {
    const { authenticate } = await import("../shopify.server");
    const { admin } = await authenticate.admin(request);
    
    const response = await admin.graphql(`
      query getDiscounts {
        codeDiscountNodes(first: 10) {
          nodes {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                codes(first: 5) {
                  nodes {
                    code
                  }
                }
                status
                startsAt
                endsAt
              }
              ... on DiscountCodeBxgy {
                title
                codes(first: 5) {
                  nodes {
                    code
                  }
                }
                status
                startsAt
                endsAt
              }
              ... on DiscountCodeFreeShipping {
                title
                codes(first: 5) {
                  nodes {
                    code
                  }
                }
                status
                startsAt
                endsAt
              }
            }
          }
        }
      }
    `);

    const discounts = response?.data?.codeDiscountNodes?.nodes || [];
    // Filter for active discounts
    const now = new Date().toISOString();
    return discounts
      .filter((node) => {
        const discount = node.codeDiscount;
        if (!discount) return false;
        
        const status = discount.status === "ACTIVE";
        const startsAt = discount.startsAt ? new Date(discount.startsAt) : null;
        const endsAt = discount.endsAt ? new Date(discount.endsAt) : null;
        const nowDate = new Date(now);
        
        if (!status) return false;
        if (startsAt && nowDate < startsAt) return false;
        if (endsAt && nowDate > endsAt) return false;
        
        return true;
      })
      .map((node) => ({
        title: node.codeDiscount?.title || "Discount",
        codes: node.codeDiscount?.codes?.nodes?.map((c) => c.code) || [],
        startsAt: node.codeDiscount?.startsAt,
        endsAt: node.codeDiscount?.endsAt,
      }));
  } catch (error) {
    console.error("[shopify-data] Error fetching discounts:", error);
    return [];
  }
}

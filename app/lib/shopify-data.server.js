/**
 * Shopify Data Fetching
 * Fetches store information, policies, products, etc. for AI responses
 */

import { sessionStorage } from "../shopify.server";
import shopify from "../shopify.server";

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
    
    // Get session from storage using shop domain
    // Session ID format: {shop}_{apiKey}
    const sessionId = `${shopDomain}_${process.env.SHOPIFY_API_KEY}`;
    const session = await sessionStorage.loadSession(sessionId);
    
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
      }
    `);

    const shopData = response?.data?.shop;
    return {
      name: shopData?.name || null,
      email: shopData?.email || null,
      description: shopData?.description || null,
      refundPolicy: shopData?.refundPolicy || null,
      privacyPolicy: shopData?.privacyPolicy || null,
      termsOfService: shopData?.termsOfService || null,
      shippingPolicy: shopData?.shippingPolicy || null,
    };
  } catch (error) {
    console.error("[shopify-data] Error fetching store info:", error);
    return null;
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

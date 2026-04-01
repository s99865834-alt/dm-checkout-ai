/**
 * Shopify Data Fetching
 * Fetches store information, policies, products, etc. for AI responses
 */

import { shopifyApi, ApiVersion } from "@shopify/shopify-api";
import { sessionStorage } from "../shopify.server";
import logger from "./logger.server";

// Lazy-initialized Admin API instance (same config as app, used when we have a session but no request)
let _shopifyApiInstance = null;
function getShopifyApi() {
  if (!_shopifyApiInstance) {
    const appUrl = (process.env.SHOPIFY_APP_URL || "https://example.com").trim();
    const hostName = new URL(appUrl).host;
    _shopifyApiInstance = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY || "",
      apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
      hostName,
      apiVersion: ApiVersion.October25,
      isEmbeddedApp: true,
    });
  }
  return _shopifyApiInstance;
}

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

/** Strip HTML tags and collapse whitespace for plain-text AI context. Keeps payload minimal. */
function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Max chars per page body in store context (keeps one query, bounded workload). */
const PAGE_BODY_MAX_CHARS = 1800;
/** Max number of pages to include body for in AI context. */
const PAGE_BODY_MAX_PAGES = 5;

/**
 * Get Shopify store information including policies using shop domain
 * @param {string} shopDomain - Shop domain (e.g., "example.myshopify.com")
 * @returns {Promise<Object>} - Store information including policies
 */
export async function getShopifyStoreInfo(shopDomain) {
  try {
    if (!shopDomain) {
      logger.debug("[shopify-data] No shop domain provided, skipping store info fetch");
      return null;
    }
    
    const session = await loadShopSession(shopDomain);

    if (!session || !session.accessToken) {
      console.error("[shopify-data] No valid session found for shop:", shopDomain);
      return null;
    }

    const api = getShopifyApi();
    const client = new api.clients.Graphql({ session });
    const query = `
      query getShopInfo {
        shop {
          name
          email
          description
          primaryDomain {
            url
            host
          }
          shopPolicies {
            type
            title
            body
            url
          }
        }
        productsCount(limit: null) {
          count
        }
        pages(first: 10) {
          nodes {
            title
            handle
            body
          }
        }
        products(first: 5, sortKey: ID) {
          nodes {
            title
            handle
            onlineStoreUrl
          }
        }
      }
    `;
    const response = await client.request(query);

    const shopData = response?.data?.shop;
    const productsCount = response?.data?.productsCount?.count ?? null;
    const rawPages = response?.data?.pages?.nodes || [];
    const products = response?.data?.products?.nodes || [];
    const primaryDomain = shopData?.primaryDomain || null;
    const baseStoreUrl = primaryDomain?.url ? primaryDomain.url.replace(/\/$/, "") : null;
    const storefrontAllProductsUrl = baseStoreUrl ? `${baseStoreUrl}/collections/all` : null;

    // Map shopPolicies array to named policies (Admin API 2024+ uses shopPolicies instead of refundPolicy etc.)
    const policies = shopData?.shopPolicies || [];
    const policyByType = (type) => policies.find((p) => p?.type === type) || null;
    const refundPolicy = policyByType("REFUND_POLICY");
    const privacyPolicy = policyByType("PRIVACY_POLICY");
    const termsOfService = policyByType("TERMS_OF_SERVICE");
    const shippingPolicy = policyByType("SHIPPING_POLICY");

    // Build page URLs and optional body summary (strip HTML, truncate; read_content only)
    const pages = rawPages.map((p) => {
      if (!p) return p;
      let bodySummary = null;
      if (p.body) {
        const plain = stripHtml(p.body);
        if (plain) {
          bodySummary = plain.length > PAGE_BODY_MAX_CHARS
            ? plain.substring(0, PAGE_BODY_MAX_CHARS) + "..."
            : plain;
        }
      }
      const onlineStoreUrl = baseStoreUrl ? `${baseStoreUrl}/pages/${p.handle}` : null;
      return { ...p, onlineStoreUrl, bodySummary };
    });

    return {
      name: shopData?.name || null,
      email: shopData?.email || null,
      description: shopData?.description || null,
      primaryDomain,
      refundPolicy: refundPolicy || null,
      privacyPolicy: privacyPolicy || null,
      termsOfService: termsOfService || null,
      shippingPolicy: shippingPolicy || null,
      productsCount,
      storefrontAllProductsUrl,
      pages,
      products,
    };
  } catch (error) {
    console.error("[shopify-data] Error fetching store info:", error);
    return null;
  }
}

/**
 * Build a single, comprehensive store context document for the AI.
 * Use this for all store_question replies so the AI can answer any question from one context.
 * Returns the context text and the list of URLs that are allowed in the reply (for sanitization).
 * When you add new store data, add it here so the AI gets it without new prompt logic.
 *
 * @param {Object} storeInfo - Result from getShopifyStoreInfo()
 * @returns {{ text: string, allowedUrls: string[] }}
 */
export function buildStoreContextForAI(storeInfo) {
  if (!storeInfo) return { text: "", allowedUrls: [] };

  const sections = [];
  const allowedUrls = [];

  if (storeInfo.name) sections.push(`Store name: ${storeInfo.name}`);
  if (storeInfo.email) {
    sections.push(`Contact email: ${storeInfo.email}`);
  }
  if (storeInfo.description) {
    sections.push(`About the store: ${storeInfo.description.substring(0, 500)}${storeInfo.description.length > 500 ? "..." : ""}`);
  }

  if (storeInfo.productsCount != null) {
    sections.push(`Total number of products: ${storeInfo.productsCount}`);
  }
  if (storeInfo.storefrontAllProductsUrl) {
    sections.push(`Browse all products: ${storeInfo.storefrontAllProductsUrl}`);
    allowedUrls.push(storeInfo.storefrontAllProductsUrl);
  }

  const policyPart = (label, policy) => {
    if (!policy) return "";
    const lines = [`${label}: ${policy.title || label}`];
    if (policy.body) lines.push(policy.body.substring(0, 2500) + (policy.body.length > 2500 ? "..." : ""));
    if (policy.url) {
      lines.push(`URL: ${policy.url}`);
      allowedUrls.push(policy.url);
    }
    return lines.join("\n");
  };
  if (storeInfo.refundPolicy) sections.push(policyPart("Return / refund policy", storeInfo.refundPolicy));
  if (storeInfo.shippingPolicy) sections.push(policyPart("Shipping policy", storeInfo.shippingPolicy));
  if (storeInfo.privacyPolicy) sections.push(policyPart("Privacy policy", storeInfo.privacyPolicy));
  if (storeInfo.termsOfService) sections.push(policyPart("Terms of service", storeInfo.termsOfService));

  if (Array.isArray(storeInfo.pages) && storeInfo.pages.length > 0) {
    const pageLines = storeInfo.pages
      .filter((p) => p?.title)
      .map((p) => (p.onlineStoreUrl ? `${p.title}: ${p.onlineStoreUrl}` : p.title));
    if (pageLines.length) {
      sections.push("Pages: " + pageLines.join(" | "));
      storeInfo.pages.forEach((p) => p.onlineStoreUrl && allowedUrls.push(p.onlineStoreUrl));
    }
    // Include body for first N pages (read_content); keeps context bounded
    const pagesWithBody = storeInfo.pages.filter((p) => p?.bodySummary).slice(0, PAGE_BODY_MAX_PAGES);
    if (pagesWithBody.length > 0) {
      sections.push("Page content (use to answer customer questions):");
      pagesWithBody.forEach((p) => {
        sections.push(`Page "${p.title}": ${p.bodySummary}`);
        if (p.onlineStoreUrl) allowedUrls.push(p.onlineStoreUrl);
      });
    }
  }
  if (Array.isArray(storeInfo.products) && storeInfo.products.length > 0) {
    const productLines = storeInfo.products
      .filter((p) => p?.title)
      .map((p) => (p.onlineStoreUrl ? `${p.title}: ${p.onlineStoreUrl}` : p.title));
    if (productLines.length) {
      sections.push("Top products (sample): " + productLines.join(" | "));
      storeInfo.products.forEach((p) => p.onlineStoreUrl && allowedUrls.push(p.onlineStoreUrl));
    }
  }

  const text = sections.filter(Boolean).join("\n\n");
  return { text, allowedUrls: [...new Set(allowedUrls)] };
}

/**
 * Fetch full product context (title, description, options, variant options) for AI replies.
 * Used when replying to comments on mapped products so the AI can answer variant questions
 * (e.g. "does this come in black?") using real data.
 *
 * @param {string} shopDomain - Shop domain (e.g., "example.myshopify.com")
 * @param {string} productId - Shopify product GID
 * @returns {Promise<Object|null>} - Raw product context or null
 */
export async function getShopifyProductContextForReply(shopDomain, productId) {
  try {
    if (!shopDomain || !productId) return null;

    const session = await loadShopSession(shopDomain);
    if (!session || !session.accessToken) {
      console.error("[shopify-data] No valid session found for shop:", shopDomain);
      return null;
    }

    const api = getShopifyApi();
    const client = new api.clients.Graphql({ session });
    const query = `
      query getProductContext($productId: ID!) {
        product(id: $productId) {
          title
          handle
          description
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
            maxVariantPrice {
              amount
              currencyCode
            }
          }
          options {
            name
            values
          }
          variants(first: 100) {
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
    `;
    const response = await client.request(query, { variables: { productId } });

    const data = response?.data;
    const product = data?.product || null;
    return product;
  } catch (error) {
    console.error("[shopify-data] Error fetching product context:", error);
    return null;
  }
}

/**
 * Build a single product context document for the AI (comment automation with mapped product).
 * Use so the AI can answer variant/product questions from real data (e.g. "does it come in black?").
 *
 * @param {Object} productContext - Raw result from getShopifyProductContextForReply()
 * @returns {{ text: string }}
 */
export function buildProductContextForAI(productContext) {
  if (!productContext) return { text: "" };

  const parts = [];
  const variants = productContext.variants?.nodes ?? [];
  const variantCount = variants.length;

  // Single-variant first so the AI always sees it and must say no to size/color questions
  if (variantCount <= 1) {
    parts.push(
      "CRITICAL: This product has only one variant. It does NOT come in different sizes or colors. If the customer asks about sizes, colors, or other options, you MUST answer no."
    );
  }

  parts.push(`Product: ${productContext.title || "Unknown"}`);

  if (productContext.description) {
    const desc = productContext.description.replace(/\s+/g, " ").trim();
    parts.push(`Description: ${desc.substring(0, 800)}${desc.length > 800 ? "..." : ""}`);
  }

  const priceRange = productContext.priceRangeV2;
  if (priceRange?.minVariantPrice) {
    const min = priceRange.minVariantPrice;
    const minStr = `${min.amount} ${min.currencyCode || ""}`.trim();
    if (priceRange.maxVariantPrice && priceRange.maxVariantPrice.amount !== priceRange.minVariantPrice.amount) {
      const max = priceRange.maxVariantPrice;
      parts.push(`Price: ${minStr} - ${max.amount} ${max.currencyCode || ""}`.trim());
    } else {
      parts.push(`Price: ${minStr}`);
    }
  }

  if (variantCount > 1) {
    const options = productContext.options;
    if (Array.isArray(options) && options.length > 0) {
      // Exclude "Title" / "Default Title" so we don't imply real choices
      const optionLines = options
        .filter(
          (o) =>
            o?.name &&
            Array.isArray(o.values) &&
            !(o.name === "Title" && o.values.length === 1 && (o.values[0] === "Default Title" || o.values[0] === "Default"))
        )
        .map((o) => `${o.name}: ${o.values.join(", ")}`);
      if (optionLines.length) {
        parts.push(`Available options: ${optionLines.join(" | ")}`);
      }
    }
    if (variantCount > 0) {
      const variantSummaries = variants.slice(0, 30).map((v) => {
        const opts = (v.selectedOptions || [])
          .filter((o) => o?.name && o?.value && !(o.name === "Title" && (o.value === "Default Title" || o.value === "Default")))
          .map((o) => `${o.name}=${o.value}`)
          .join(", ");
        return opts ? `${opts} (${v.price})` : v.price;
      });
      if (variantSummaries.length) {
        parts.push(`Variants (sample): ${variantSummaries.join("; ")}`);
      }
    }
  }

  const text = parts.filter(Boolean).join("\n\n");
  return { text };
}

/**
 * Detect whether a product has a "Size" option that warrants asking the customer.
 * Returns null if no size question is needed (single size, one-size-fits-all, etc.)
 *
 * @param {Object} productOptions - { options: [{name, values}], variants: [{id, title, price, selectedOptions}] }
 *   Can be the cached `product_options` from post_product_map or raw product context.
 * @returns {{ sizeOptionName: string, sizeValues: string[], variants: Array } | null}
 */
export function detectSizeOption(productOptions) {
  if (!productOptions) return null;

  const options = productOptions.options;
  if (!Array.isArray(options)) return null;

  const SIZE_NAMES = /^(size|sizing|taille|tamaño|größe|grösse)$/i;
  const ONE_SIZE_VALUES = /^(one\s*size|os|osfa|one\s*size\s*fits\s*all|n\/a|default|free\s*size|freesize|universal|uni|default\s*title)$/i;

  const sizeOption = options.find((o) => o?.name && SIZE_NAMES.test(o.name.trim()));
  if (!sizeOption || !Array.isArray(sizeOption.values)) return null;

  const meaningfulSizes = sizeOption.values.filter((v) => !ONE_SIZE_VALUES.test((v || "").trim()));
  if (meaningfulSizes.length <= 1) return null;

  return {
    sizeOptionName: sizeOption.name,
    sizeValues: meaningfulSizes,
    variants: productOptions.variants?.nodes || productOptions.variants || [],
  };
}

/**
 * Given a product's variants, the originally-mapped variant, and the customer's chosen size,
 * find the variant that matches the mapped variant's non-size options plus the new size.
 *
 * @param {Array} variants - All variants (each has `id`, `selectedOptions`)
 * @param {string} mappedVariantId - The variant the merchant originally mapped (determines color, etc.)
 * @param {string} sizeOptionName - The option name for size (e.g., "Size")
 * @param {string} chosenSize - The size the customer asked for (e.g., "Medium", "M")
 * @returns {{ variant: Object, exactMatch: boolean } | null}
 */
const SIZE_ALIASES = new Map([
  ["xs", ["xs", "x-small", "x small", "extra small", "extra-small", "xsmall"]],
  ["s", ["s", "small", "sm"]],
  ["m", ["m", "medium", "med", "md"]],
  ["l", ["l", "large", "lg"]],
  ["xl", ["xl", "x-large", "x large", "extra large", "extra-large", "xlarge"]],
  ["xxl", ["xxl", "xx-large", "xx large", "2xl", "2x", "xxlarge"]],
  ["xxxl", ["xxxl", "xxx-large", "3xl", "3x", "xxxlarge"]],
  ["xxs", ["xxs", "xx-small", "xx small", "2xs", "xxsmall"]],
  ["0", ["0", "zero"]],
  ["00", ["00", "double zero"]],
  ["one size", ["one size", "os", "osfa", "one size fits all", "free size", "uni", "universal"]],
]);

function expandSizeAliases(input) {
  const lower = (input || "").trim().toLowerCase();
  const canonical = [];
  for (const [, aliases] of SIZE_ALIASES) {
    if (aliases.includes(lower)) {
      canonical.push(...aliases);
    }
  }
  return canonical.length > 0 ? canonical : [lower];
}

export function resolveVariantBySize(variants, mappedVariantId, sizeOptionName, chosenSize) {
  if (!variants?.length || !chosenSize) return null;

  const mapped = variants.find((v) => v.id === mappedVariantId);
  const nonSizeOptions = (mapped?.selectedOptions || []).filter(
    (o) => o.name.toLowerCase() !== sizeOptionName.toLowerCase()
  );

  const normalize = (s) => (s || "").trim().toLowerCase();
  const target = normalize(chosenSize);
  const targetAliases = expandSizeAliases(target);

  const matchesNonSizeOpts = (v) => {
    const opts = v.selectedOptions || [];
    return nonSizeOptions.every((req) =>
      opts.some((o) => normalize(o.name) === normalize(req.name) && normalize(o.value) === normalize(req.value))
    );
  };

  const getSizeValue = (v) => {
    const opts = v.selectedOptions || [];
    const sizeOpt = opts.find((o) => normalize(o.name) === normalize(sizeOptionName));
    return sizeOpt ? normalize(sizeOpt.value) : null;
  };

  // Pass 1: exact match (e.g., "medium" === "medium")
  for (const v of variants) {
    if (!matchesNonSizeOpts(v)) continue;
    const val = getSizeValue(v);
    if (val && val === target) return { variant: v, exactMatch: true };
  }

  // Pass 2: alias match (e.g., customer says "M", variant is "Medium" — both share the M alias group)
  for (const v of variants) {
    if (!matchesNonSizeOpts(v)) continue;
    const val = getSizeValue(v);
    if (val && targetAliases.includes(val)) return { variant: v, exactMatch: true };
    const valAliases = expandSizeAliases(val);
    if (valAliases.some((a) => targetAliases.includes(a))) return { variant: v, exactMatch: true };
  }

  // Pass 3: substring match as last resort (e.g., "petit" in "petite")
  for (const v of variants) {
    if (!matchesNonSizeOpts(v)) continue;
    const val = getSizeValue(v);
    if (val && (val.includes(target) || target.includes(val))) return { variant: v, exactMatch: false };
  }

  return null;
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

    const api = getShopifyApi();
    const client = new api.clients.Graphql({ session });
    const query = variantId
      ? `
      query getProductInfo($productId: ID!, $variantId: ID!) {
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
    `
      : `
      query getProductInfo($productId: ID!) {
        product(id: $productId) {
          title
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    `;
    const variables = variantId ? { productId, variantId } : { productId };
    const response = await client.request(query, { variables });

    const product = response?.data?.product || null;
    const variant = response?.data?.productVariant || null;

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
 * Search for products by name or handle (requires request for Shopify auth)
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
 * Webhook-safe product search: uses stored session instead of request auth.
 * Call from automation/webhook context where there's no Shopify-authenticated request.
 * @param {string} shopDomain - e.g. "mystore.myshopify.com"
 * @param {string} searchTerm - Product name or keyword
 * @param {number} limit - Max results (default 5)
 * @returns {Promise<Array>} - Matching products with id, title, handle, first variant
 */
export async function searchProductsByDomain(shopDomain, searchTerm, limit = 5) {
  try {
    if (!shopDomain || !searchTerm) return [];

    const session = await loadShopSession(shopDomain);
    if (!session?.accessToken) {
      logger.debug("[shopify-data] No session for product search:", shopDomain);
      return [];
    }

    const api = getShopifyApi();
    const client = new api.clients.Graphql({ session });
    const response = await client.request(
      `query searchProducts($query: String!, $first: Int!) {
        products(first: $first, query: $query) {
          nodes {
            id
            title
            handle
            variants(first: 1) {
              nodes {
                id
                title
                price
              }
            }
          }
        }
      }`,
      {
        variables: {
          query: `title:*${searchTerm}*`,
          first: limit,
        },
      }
    );

    return response?.data?.products?.nodes || [];
  } catch (error) {
    console.error("[shopify-data] Error in searchProductsByDomain:", error?.message);
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

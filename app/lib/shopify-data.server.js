/**
 * Shopify Data Fetching
 * Fetches store information, policies, products, etc. for AI responses
 */

import { unauthenticated } from "../shopify.server";
import { markShopUninstalled } from "./db.server";
import logger from "./logger.server";

// ---------------------------------------------------------------------------
// Background Admin API access
// ---------------------------------------------------------------------------
// All lookups here run outside an embedded request (webhooks, automation, the
// internal admin dashboard), so they authenticate with the shop's stored
// offline session via unauthenticated.admin(). Going through the app library
// (instead of a raw @shopify/shopify-api client) matters because the app uses
// expiring offline access tokens (60-min TTL): the library transparently
// refreshes the access token with the stored refresh token when it's near
// expiry. A raw client would start returning 401s an hour after the merchant
// last opened the app.

/** True when Shopify definitively rejected the refresh token — this only
 * happens after the merchant uninstalls the app (Shopify revokes the token). */
function isTokenRevokedError(error) {
  return (
    error?.response?.code === 400 &&
    error?.response?.body?.error === "invalid_subject_token"
  );
}

/**
 * Admin GraphQL client for a shop's stored offline session, or null when the
 * shop has no usable session. When Shopify reports the token as revoked
 * (uninstall that our app/uninstalled webhook missed), the shop is marked
 * inactive so it drops off the admin dashboard and stops being retried.
 */
async function getAdminClient(shopDomain) {
  if (!shopDomain) return null;
  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    return admin;
  } catch (error) {
    if (error?.constructor?.name === "SessionNotFoundError") {
      logger.debug(`[shopify-data] no offline session for ${shopDomain}`);
      return null;
    }
    if (isTokenRevokedError(error)) {
      console.warn(
        `[shopify-data] token revoked for ${shopDomain} (app uninstalled); marking shop inactive`,
      );
      await markShopUninstalled(shopDomain).catch((e) =>
        console.error(`[shopify-data] failed to mark ${shopDomain} inactive:`, e?.message || e),
      );
      return null;
    }
    const detail =
      error instanceof Response
        ? `HTTP ${error.status}`
        : error?.message || String(error);
    console.error(`[shopify-data] admin client unavailable for ${shopDomain}: ${detail}`);
    return null;
  }
}

/** Run a GraphQL query on the shop's offline session and return the parsed body. */
async function shopGraphql(admin, query, variables = undefined) {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  return response.json();
}

// ---------------------------------------------------------------------------
// Store total revenue (year-to-date)
// ---------------------------------------------------------------------------
// Sums a merchant's total Shopify sales for the current calendar year using
// their offline Admin session. Uses the orders connection (read_orders) since
// the app doesn't hold read_reports/ShopifyQL scope. Results are cached
// in-process for an hour so the admin dashboard doesn't re-paginate Shopify on
// every load. Best-effort: returns null on any failure so a single bad token
// never breaks the dashboard.

const _revenueYtdCache = new Map(); // shopDomain -> { value, at }
const REVENUE_YTD_TTL_MS = 60 * 60 * 1000; // 1 hour
// 20 pages * 250 orders = 5,000-order ceiling per store per load. Beyond that
// the figure is reported as a lower bound (capped) to keep page loads bounded.
const REVENUE_YTD_MAX_PAGES = 20;

async function _fetchStoreTotalRevenueYTD(shopDomain) {
  const admin = await getAdminClient(shopDomain);
  if (!admin) {
    logger.debug(`[shopify-data] revenue YTD: no session for ${shopDomain}`);
    return null;
  }

  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const query = `
    query StoreRevenueYTD($cursor: String) {
      orders(first: 250, after: $cursor, query: "created_at:>=${yearStart}") {
        pageInfo { hasNextPage endCursor }
        nodes {
          currentTotalPriceSet { shopMoney { amount currencyCode } }
        }
      }
    }
  `;

  let cursor = null;
  let total = 0;
  let currencyCode = null;
  let pages = 0;

  while (pages < REVENUE_YTD_MAX_PAGES) {
    const response = await shopGraphql(admin, query, { cursor });
    const conn = response?.data?.orders;
    for (const order of conn?.nodes || []) {
      const money = order?.currentTotalPriceSet?.shopMoney;
      if (money?.amount) total += parseFloat(money.amount) || 0;
      if (!currencyCode && money?.currencyCode) currencyCode = money.currencyCode;
    }
    pages += 1;
    if (conn?.pageInfo?.hasNextPage) {
      cursor = conn.pageInfo.endCursor;
      // Ease Shopify's cost-based GraphQL throttle between pages.
      await new Promise((resolve) => setTimeout(resolve, 200));
    } else {
      return { amount: total, currencyCode, capped: false };
    }
  }

  return { amount: total, currencyCode, capped: true };
}

/**
 * Total Shopify sales for a store, year-to-date. Cached in-process for 1 hour.
 * @param {string} shopDomain
 * @returns {Promise<{amount:number, currencyCode:string|null, capped:boolean}|null>}
 */
export async function getStoreTotalRevenueYTD(shopDomain) {
  if (!shopDomain) return null;

  const cached = _revenueYtdCache.get(shopDomain);
  if (cached && Date.now() - cached.at < REVENUE_YTD_TTL_MS) {
    return cached.value;
  }

  try {
    const value = await _fetchStoreTotalRevenueYTD(shopDomain);
    if (value) _revenueYtdCache.set(shopDomain, { value, at: Date.now() });
    return value;
  } catch (error) {
    console.error(
      `[shopify-data] revenue YTD failed for ${shopDomain}:`,
      error?.message || error,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Managed Pricing free-trial status (live)
// ---------------------------------------------------------------------------
// Under Shopify Managed Pricing a trialing subscription is already ACTIVE, so
// the only way to tell a trialing merchant from a paying one is createdAt +
// trialDays on the active subscription. We read it live from the merchant's
// offline Admin session, cached in-process for an hour and best-effort so a
// single bad/expired token never breaks the admin dashboard.

const _trialCache = new Map(); // shopDomain -> { value, at }
const TRIAL_TTL_MS = 60 * 60 * 1000; // 1 hour

async function _fetchStoreManagedTrial(shopDomain) {
  const admin = await getAdminClient(shopDomain);
  if (!admin) return null;

  const query = `
    query AdminActiveSubscription {
      currentAppInstallation {
        activeSubscriptions {
          name
          status
          createdAt
          trialDays
        }
      }
    }
  `;

  const response = await shopGraphql(admin, query);
  const subscriptions =
    response?.data?.currentAppInstallation?.activeSubscriptions || [];
  const sub = subscriptions.find((s) => s.status === "ACTIVE") || null;
  if (!sub) return null;

  const trialDays = Number(sub.trialDays) || 0;
  if (trialDays <= 0 || !sub.createdAt) return null;

  const trialEndsAt = new Date(
    new Date(sub.createdAt).getTime() + trialDays * 24 * 60 * 60 * 1000,
  );
  const msLeft = trialEndsAt.getTime() - Date.now();
  if (msLeft <= 0) return null;

  return {
    daysLeft: Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
    trialEndsAt: trialEndsAt.toISOString(),
  };
}

/**
 * Live Shopify Managed Pricing trial status for a store. Cached 1 hour.
 * Returns { daysLeft, trialEndsAt } while the merchant is in a paid-plan trial,
 * or null when there's no trial (or the lookup fails).
 * @param {string} shopDomain
 * @returns {Promise<{daysLeft:number, trialEndsAt:string}|null>}
 */
export async function getStoreManagedTrial(shopDomain) {
  if (!shopDomain) return null;

  const cached = _trialCache.get(shopDomain);
  if (cached && Date.now() - cached.at < TRIAL_TTL_MS) {
    return cached.value;
  }

  try {
    const value = await _fetchStoreManagedTrial(shopDomain);
    _trialCache.set(shopDomain, { value, at: Date.now() });
    return value;
  } catch (error) {
    console.error(
      `[shopify-data] managed trial lookup failed for ${shopDomain}:`,
      error?.message || error,
    );
    return null;
  }
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
    
    const admin = await getAdminClient(shopDomain);
    if (!admin) {
      console.error("[shopify-data] No valid session found for shop:", shopDomain);
      return null;
    }

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
    const response = await shopGraphql(admin, query);

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
  if (!storeInfo) return { text: "", allowedUrls: [], urlMap: {} };

  const sections = [];
  const allowedUrls = [];
  const urlMap = {};

  // When the Storefront MCP returned an authoritative answer for this
  // question, put it first so the AI prefers it over any cached storeInfo
  // fields. The rest of storeInfo is still included so URL placeholder
  // tokens (e.g. {{refund_policy_url}}) continue to resolve.
  if (typeof storeInfo.mcpAnswer === "string" && storeInfo.mcpAnswer.trim()) {
    sections.push(
      `Authoritative answer from merchant's store (use this verbatim when it answers the question): ${storeInfo.mcpAnswer.trim()}`
    );
  }

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
    const token = "{{all_products_url}}";
    sections.push(`Browse all products: ${token}`);
    allowedUrls.push(storeInfo.storefrontAllProductsUrl);
    urlMap[token] = storeInfo.storefrontAllProductsUrl;
  }

  const POLICY_TOKENS = {
    refund: "{{refund_policy_url}}",
    shipping: "{{shipping_policy_url}}",
    privacy: "{{privacy_policy_url}}",
    terms: "{{terms_url}}",
  };

  const policyPart = (label, policy, tokenKey) => {
    if (!policy) return "";
    const lines = [`${label}: ${policy.title || label}`];
    if (policy.body) lines.push(policy.body.substring(0, 2500) + (policy.body.length > 2500 ? "..." : ""));
    if (policy.url) {
      const token = POLICY_TOKENS[tokenKey] || `{{${tokenKey}_url}}`;
      lines.push(`URL: ${token}`);
      allowedUrls.push(policy.url);
      urlMap[token] = policy.url;
    }
    return lines.join("\n");
  };
  if (storeInfo.refundPolicy) sections.push(policyPart("Return / refund policy", storeInfo.refundPolicy, "refund"));
  if (storeInfo.shippingPolicy) sections.push(policyPart("Shipping policy", storeInfo.shippingPolicy, "shipping"));
  if (storeInfo.privacyPolicy) sections.push(policyPart("Privacy policy", storeInfo.privacyPolicy, "privacy"));
  if (storeInfo.termsOfService) sections.push(policyPart("Terms of service", storeInfo.termsOfService, "terms"));

  if (Array.isArray(storeInfo.pages) && storeInfo.pages.length > 0) {
    const pageLines = storeInfo.pages
      .filter((p) => p?.title)
      .map((p) => {
        if (p.onlineStoreUrl) {
          const token = `{{page:${p.title}}}`;
          allowedUrls.push(p.onlineStoreUrl);
          urlMap[token] = p.onlineStoreUrl;
          return `${p.title}: ${token}`;
        }
        return p.title;
      });
    if (pageLines.length) {
      sections.push("Pages: " + pageLines.join(" | "));
    }
    const pagesWithBody = storeInfo.pages.filter((p) => p?.bodySummary).slice(0, PAGE_BODY_MAX_PAGES);
    if (pagesWithBody.length > 0) {
      sections.push("Page content (use to answer customer questions):");
      pagesWithBody.forEach((p) => {
        const suffix = p.onlineStoreUrl ? ` (link: {{page:${p.title}}})` : "";
        sections.push(`Page "${p.title}": ${p.bodySummary}${suffix}`);
      });
    }
  }
  if (Array.isArray(storeInfo.products) && storeInfo.products.length > 0) {
    const productLines = storeInfo.products
      .filter((p) => p?.title)
      .map((p) => {
        if (p.onlineStoreUrl) {
          const token = `{{product:${p.title}}}`;
          allowedUrls.push(p.onlineStoreUrl);
          urlMap[token] = p.onlineStoreUrl;
          return `${p.title}: ${token}`;
        }
        return p.title;
      });
    if (productLines.length) {
      sections.push("Top products (sample): " + productLines.join(" | "));
    }
  }

  const text = sections.filter(Boolean).join("\n\n");
  return { text, allowedUrls: [...new Set(allowedUrls)], urlMap };
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

    const admin = await getAdminClient(shopDomain);
    if (!admin) {
      console.error("[shopify-data] No valid session found for shop:", shopDomain);
      return null;
    }

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
    const response = await shopGraphql(admin, query, { productId });

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

    const admin = await getAdminClient(shopDomain);
    if (!admin) {
      console.error("[shopify-data] No valid session found for shop:", shopDomain);
      return { productName: null, productPrice: null };
    }

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
    const response = await shopGraphql(admin, query, variables);

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

    const admin = await getAdminClient(shopDomain);
    if (!admin) {
      logger.debug("[shopify-data] No session for product search:", shopDomain);
      return [];
    }

    const response = await shopGraphql(
      admin,
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
        query: `title:*${searchTerm}*`,
        first: limit,
      }
    );

    return response?.data?.products?.nodes || [];
  } catch (error) {
    console.error("[shopify-data] Error in searchProductsByDomain:", error?.message);
    return [];
  }
}


/**
 * Shopify Data Fetching
 * Fetches store information, policies, products, etc. for AI responses
 */

import { unauthenticated } from "../shopify.server";
import { markShopUninstalled } from "./db.server";
import { cached } from "./loader-cache.server";
import logger from "./logger.server";
import { expandSizeAliases } from "./variant-match";
import { isShopNotFoundError, isShopifyAutomatedReviewShop } from "./shopify-review-shop";
import { resolveCustomerFacingEmail } from "./contact-email";

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

/** True when Shopify says the STORE itself is suspended (402 Payment
 * Required — the owner stopped paying their Shopify subscription). Every API
 * call fails this way until they pay or the store is closed; nothing on our
 * side is wrong or fixable, so callers should negative-cache and stay quiet
 * instead of error-logging on every dashboard load. */
function isStoreFrozenError(error) {
  if (error?.networkStatusCode === 402 || error?.response?.code === 402) return true;
  return String(error?.message || "").includes("402 Payment Required");
}

function isExpectedAdminApiMiss(error) {
  return isStoreFrozenError(error) || isShopNotFoundError(error);
}

/**
 * Admin GraphQL client for a shop's stored offline session, or null when the
 * shop has no usable session. When Shopify reports the token as revoked
 * (uninstall that our app/uninstalled webhook missed), the shop is marked
 * inactive so it drops off the admin dashboard and stops being retried.
 */
async function getAdminClient(shopDomain) {
  if (!shopDomain) return null;
  if (isShopifyAutomatedReviewShop(shopDomain)) return null;
  try {
    const { admin } = await unauthenticated.admin(shopDomain);
    return admin;
  } catch (error) {
    if (error?.constructor?.name === "SessionNotFoundError") {
      logger.debug(`[shopify-data] no offline session for ${shopDomain}`);
      return null;
    }
    if (isExpectedAdminApiMiss(error)) {
      logger.debug(`[shopify-data] admin client skipped for ${shopDomain}: ${error?.message || error}`);
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
  try {
    const response = await admin.graphql(query, variables ? { variables } : undefined);
    return response.json();
  } catch (error) {
    if (isExpectedAdminApiMiss(error)) throw error;
    // The GraphQL client buries the actual errors in error.errors.graphQLErrors,
    // which console.error renders as "[Array]" (Node truncates nested objects).
    // Surface them as JSON so production logs are actually diagnosable.
    const gqlErrors = error?.errors?.graphQLErrors;
    if (gqlErrors) {
      console.error("[shopify-data] GraphQL errors:", JSON.stringify(gqlErrors));
    }
    throw error;
  }
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
    if (isExpectedAdminApiMiss(error)) {
      // Frozen (402) or gone (404, including scanner shops). Expected.
      // Negative-cache so we don't re-query (and re-log) on every dashboard load.
      _revenueYtdCache.set(shopDomain, { value: null, at: Date.now() });
      logger.debug(`[shopify-data] ${shopDomain} skipped revenue YTD: ${error?.message || error}`);
      return null;
    }
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
    if (isExpectedAdminApiMiss(error)) {
      _trialCache.set(shopDomain, { value: null, at: Date.now() });
      logger.debug(`[shopify-data] ${shopDomain} skipped trial lookup: ${error?.message || error}`);
      return null;
    }
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
/** Storefront HTML fetch for footer emails. Must not block a reply. */
const STOREFRONT_EMAIL_FETCH_MS = 2000;
const STOREFRONT_EMAIL_MAX_CHARS = 200000;

function summarizePage(p, baseStoreUrl) {
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
}

function mergePagesByHandle(primary, extra) {
  const byHandle = new Map();
  for (const page of [...(extra || []), ...(primary || [])]) {
    if (!page?.handle) continue;
    if (!byHandle.has(page.handle)) byHandle.set(page.handle, page);
  }
  return [...byHandle.values()];
}

async function fetchStorefrontHtml(url) {
  if (!url) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STOREFRONT_EMAIL_FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "SocialReplAI/1.0 (+https://www.socialrepl.ai)" },
    });
    if (!res.ok) return "";
    const text = await res.text();
    return text.slice(0, STOREFRONT_EMAIL_MAX_CHARS);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

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
          contactEmail
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
        pages(first: 20) {
          nodes {
            title
            handle
            body
          }
        }
        contactPages: pages(first: 10, query: "contact") {
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
    const rawPages = mergePagesByHandle(
      response?.data?.pages?.nodes || [],
      response?.data?.contactPages?.nodes || [],
    );
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

    const pages = rawPages.map((p) => summarizePage(p, baseStoreUrl));
    const homepageHtml = await fetchStorefrontHtml(baseStoreUrl);
    const resolvedEmail = resolveCustomerFacingEmail({
      pages,
      homepageHtml,
      contactEmail: shopData?.contactEmail || null,
      shopEmail: shopData?.email || null,
      storeHost: primaryDomain?.host || null,
    });

    return {
      name: shopData?.name || null,
      email: resolvedEmail.email,
      emailSource: resolvedEmail.source,
      ownerEmail: shopData?.email || null,
      contactEmail: shopData?.contactEmail || null,
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
    if (isExpectedAdminApiMiss(error)) {
      logger.debug(`[shopify-data] store info skipped for ${shopDomain}: ${error?.message || error}`);
      return null;
    }
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
 * The shop's primary CUSTOM storefront domain (e.g. "velahaircare.com"), or
 * null when the store only has its *.myshopify.com domain or SSL isn't ready.
 * Used to serve DM tracking links on the merchant's own domain via the app
 * proxy (/a/go/{linkId}) so links look like the store, not a shortener.
 * Cached 24h per shop — primary domains effectively never change.
 *
 * @param {string} shopDomain - the *.myshopify.com domain (session key)
 * @returns {Promise<string|null>}
 */
export async function getShopPrimaryDomainHost(shopDomain) {
  if (!shopDomain) return null;
  return cached(`primarydomain:${shopDomain}`, 24 * 60 * 60 * 1000, async () => {
    const admin = await getAdminClient(shopDomain);
    if (!admin) return null;
    const response = await shopGraphql(
      admin,
      `query getPrimaryDomain {
        shop {
          primaryDomain {
            host
            sslEnabled
          }
        }
      }`
    );
    const primary = response?.data?.shop?.primaryDomain;
    const host = (primary?.host || "").trim().toLowerCase();
    // myshopify.com hosts are excluded by design (merchant preference: links
    // must show the real brand domain). No SSL → https link would warn.
    if (!host || host.endsWith(".myshopify.com") || primary?.sslEnabled === false) {
      return null;
    }
    return host;
  }).catch((err) => {
    logger.debug(`[shopify-data] primaryDomain lookup failed for ${shopDomain}: ${err?.message || err}`);
    return null;
  });
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
// Admin GraphQL ID! variables require gid:// format, but callers hold a mix
// of gids and bare numeric IDs depending on where the ID was persisted.
// Normalize at this boundary so no caller format can produce an invalid query.
function toAdminGid(id, type) {
  if (!id) return id;
  const s = String(id);
  return /^\d+$/.test(s) ? `gid://shopify/${type}/${s}` : s;
}

export async function getShopifyProductContextForReply(shopDomain, productId) {
  try {
    if (!shopDomain || !productId) return null;
    productId = toAdminGid(productId, "Product");

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
              availableForSale
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
 * Title + featured image for DM link previews. Kept tiny so Instagram's
 * crawler is not waiting on the full product-context query.
 *
 * @param {string} shopDomain
 * @param {string} productId
 * @returns {Promise<{title: string|null, imageUrl: string|null}|null>}
 */
export async function getProductOgPreview(shopDomain, productId) {
  try {
    if (!shopDomain || !productId) return null;
    productId = toAdminGid(productId, "Product");
    const admin = await getAdminClient(shopDomain);
    if (!admin) return null;
    const response = await shopGraphql(
      admin,
      `query ProductOgPreview($productId: ID!) {
        product(id: $productId) {
          title
          featuredImage {
            url
          }
        }
      }`,
      { productId },
    );
    const product = response?.data?.product;
    if (!product) return null;
    return {
      title: product.title || null,
      imageUrl: product.featuredImage?.url || null,
    };
  } catch (error) {
    if (isExpectedAdminApiMiss(error)) return null;
    logger.debug(
      `[shopify-data] product OG preview failed for ${shopDomain}: ${error?.message || error}`,
    );
    return null;
  }
}

// Published collections, cached because the comment fallback reads this on
// every unmapped post and the list changes about as often as the catalogue.
const _shopCollectionsCache = new Map(); // shopDomain -> { value, at }
const SHOP_COLLECTIONS_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Published collections for matching a caption or comment to a real
 * collection page. Title + handle + image only: the comment path just needs
 * enough to pick a URL and fill the preview card.
 *
 * @param {string} shopDomain
 * @returns {Promise<Array<{title: string, handle: string, imageUrl: string|null}>>}
 */
export async function getShopCollections(shopDomain) {
  if (!shopDomain) return [];

  const cached = _shopCollectionsCache.get(shopDomain);
  if (cached && Date.now() - cached.at < SHOP_COLLECTIONS_TTL_MS) return cached.value;

  try {
    const admin = await getAdminClient(shopDomain);
    if (!admin) return [];
    const response = await shopGraphql(
      admin,
      `query ShopCollections {
        collections(first: 150, query: "published_status:published") {
          nodes {
            title
            handle
            image { url }
          }
        }
      }`,
    );
    const nodes = response?.data?.collections?.nodes || [];
    const value = nodes
      .filter((node) => node?.handle && node?.title)
      .map((node) => ({
        title: node.title,
        handle: node.handle,
        imageUrl: node.image?.url || null,
      }));
    _shopCollectionsCache.set(shopDomain, { value, at: Date.now() });
    return value;
  } catch (error) {
    if (isExpectedAdminApiMiss(error)) return [];
    logger.debug(
      `[shopify-data] collections lookup failed for ${shopDomain}: ${error?.message || error}`,
    );
    return [];
  }
}

export function collectionOgPreview(collections, handle) {
  if (!handle || !Array.isArray(collections)) return null;
  const wanted = String(handle).trim().toLowerCase();
  const match = collections.find((c) => (c.handle || "").toLowerCase() === wanted);
  if (!match) return null;
  return {
    title: match.title || null,
    imageUrl: match.imageUrl || null,
  };
}

// Store-level preview image, cached because it is the same for every browse
// link a shop ever sends and it changes about as often as the catalogue does.
const _shopOgCache = new Map(); // shopDomain -> { value, at }
const SHOP_OG_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * An image to represent the whole store, for links that aren't about one
 * product.
 *
 * Browse links carry no product_id, so the preview card had no image at all
 * and Instagram rendered an empty grey box. Shopify's own brand assets would
 * be the right source, but Shop.brand needs the read_brand scope and a
 * merchant re-authorisation, which is a lot to ask for a thumbnail. A product
 * image needs nothing we don't already hold.
 *
 * @param {string} shopDomain
 * @returns {Promise<string|null>}
 */
export async function getShopOgImage(shopDomain) {
  if (!shopDomain) return null;

  const cached = _shopOgCache.get(shopDomain);
  if (cached && Date.now() - cached.at < SHOP_OG_TTL_MS) return cached.value;

  try {
    const admin = await getAdminClient(shopDomain);
    if (!admin) return null;
    const response = await shopGraphql(
      admin,
      `query ShopOgImage {
        products(first: 1, sortKey: UPDATED_AT, reverse: true) {
          nodes { featuredImage { url } }
        }
      }`,
    );
    const url = response?.data?.products?.nodes?.[0]?.featuredImage?.url || null;
    _shopOgCache.set(shopDomain, { value: url, at: Date.now() });
    return url;
  } catch (error) {
    if (isExpectedAdminApiMiss(error)) return null;
    logger.debug(
      `[shopify-data] shop OG image failed for ${shopDomain}: ${error?.message || error}`,
    );
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
    productId = toAdminGid(productId, "Product");
    variantId = toAdminGid(variantId, "ProductVariant");

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


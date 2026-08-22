/**
 * Tracked-link builders for DM replies.
 *
 * Extracted from automation.server.js so the sales agent
 * (sales-agent.server.js) can mint checkout / product-page links from inside
 * its tool loop without importing the whole automation pipeline (which itself
 * imports the agent — that would be a circular dependency).
 *
 * Every link built here gets a link_id; the /{linkId} redirect route resolves
 * it via the links_sent table, which is how clicks (and ultimately sales) are
 * attributed back to the DM that sent them.
 */

import { randomBytes } from "crypto";
import supabase from "./supabase.server";
import logger from "./logger.server";
import { sessionStorage } from "../shopify.server";
import shopify from "../shopify.server";
import { getShopifyProductContextForReply, getShopPrimaryDomainHost } from "./shopify-data.server";
import { isCheckoutLinkId } from "./checkout-link-id";

export { isCheckoutLinkId };

/** Base62 alphabet for URL-safe short IDs (62^8 ≈ 218T combinations) */
const ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Generate an 8-character link_id (base62, low collision risk)
 */
export function generateLinkId() {
  const bytes = randomBytes(8);
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += ID_CHARS[bytes[i] % 62];
  }
  return id;
}

function getShortLinkBase() {
  let shortBase = (process.env.SHORT_LINK_DOMAIN || "").trim().replace(/\/$/, "");
  // Default to the marketing domain: it has an established reputation with
  // the threat-intel feeds that ISP filters use. The old srai.link shortener
  // domain got flagged by Xfinity Advanced Security (safebrowse.io) — .link
  // shortener domains are treated as suspicious by default. srai.link stays
  // pointed at this app so previously sent links keep resolving.
  if (!shortBase) shortBase = "https://www.socialrepl.ai";
  return shortBase;
}

/**
 * Fallback short URL on the shared short-link domain.
 * Root path /{linkId} (no /c/) for shorter URLs. Uses SHORT_LINK_DOMAIN when set.
 */
export function getClickTrackingUrlForMessage(linkId) {
  return `${getShortLinkBase()}/${linkId}`;
}

/**
 * The tracked URL to paste into a DM for `linkId`, preferring the merchant's
 * own storefront domain via the app proxy: https://{store-domain}/a/go/{id}.
 * On-brand ("feels like the store, not a third-party tool") and immune to
 * shortener-domain blocklists, since each link rides the merchant's own
 * domain reputation. Falls back to the shared short-link domain when the
 * store has no custom domain (myshopify.com hosts are excluded by design).
 *
 * @param {Object} shop - shops row (needs shopify_domain)
 * @param {string} linkId
 * @returns {Promise<string>}
 */
export async function getTrackedLinkUrl(shop, linkId) {
  const host = shop?.shopify_domain
    ? await getShopPrimaryDomainHost(shop.shopify_domain)
    : null;
  if (host) return `https://${host}/a/go/${linkId}`;
  return getClickTrackingUrlForMessage(linkId);
}

/** True when a URL is already one of our tracked links (either form). */
function isTrackedLinkUrl(url, shortBase) {
  return url.startsWith(shortBase + "/") || url.includes("/a/go/");
}

/**
 * Replace full URLs in reply text with tracked short links.
 * Creates a links_sent row for each URL so the redirect routes can resolve it.
 * URLs that are already tracked links (short domain or merchant-domain proxy)
 * are left untouched — they were minted earlier in the same reply.
 *
 * @param {Object} shop - shops row (id + shopify_domain)
 * @param {string|null} messageId
 * @param {string} text
 */
export async function shortenUrlsInReply(shop, messageId, text) {
  if (!text) return text;
  const urlRegex = /https?:\/\/[^\s)]+/g;
  const urls = text.match(urlRegex);
  if (!urls || urls.length === 0) return text;

  const shortBase = getShortLinkBase();
  let result = text;
  for (const url of [...new Set(urls)]) {
    if (isTrackedLinkUrl(url, shortBase)) continue;
    const linkId = `info_${randomBytes(6).toString("hex")}`;
    const { error } = await supabase.from("links_sent").insert({
      shop_id: shop.id,
      message_id: messageId,
      url,
      link_id: linkId,
    });
    if (error) {
      logger.debug(`[links] Short-link insert failed for ${url}: ${error.message}`);
      continue;
    }
    const shortUrl = await getTrackedLinkUrl(shop, linkId);
    result = result.split(url).join(shortUrl);
  }
  return result;
}

export function getShopDomainHost(shop) {
  const rawDomain = shop?.shopify_domain;
  if (!rawDomain) return null;
  try {
    const url = rawDomain.includes("://")
      ? new URL(rawDomain)
      : new URL(`https://${rawDomain}`);
    return url.hostname;
  } catch (error) {
    console.warn(`[links] Invalid shopify_domain: ${rawDomain}`);
    return null;
  }
}

export function getShopHomepageUrl(shop) {
  const host = getShopDomainHost(shop);
  return host ? `https://${host}` : null;
}

/**
 * Build a Shopify product detail page (PDP) link.
 * Always uses product HANDLE in the path (/products/{handle}), never numeric ID.
 * Mirrors the shape of {@link buildCheckoutLink}: returns a {url, linkId} pair so
 * callers can wrap the URL with the srai.link shortener (via
 * {@link getClickTrackingUrlForMessage}) and persist a `links_sent` row for
 * click tracking. PDP link IDs are prefixed with "pdp_" so analytics CTR (which
 * only counts checkout clicks) stays accurate.
 *
 * Returns null (instead of throwing) when we can't resolve a handle — the PDP
 * link is a nice-to-have and must never block the main reply flow. Callers
 * already destructure `pdpResult?.url`, so null flows through cleanly and the
 * reply falls back to the checkout link.
 *
 * @param {Object} shop - Shop object with shopify_domain
 * @param {string} productId - Shopify product ID (gid format)
 * @param {string|null} variantId - Shopify variant ID (gid format, optional)
 * @param {string|null} productHandle - Product handle (optional; fetched from API if missing)
 * @returns {Promise<{url: string, linkId: string} | null>} - PDP URL + link ID, or null if the handle couldn't be resolved
 */
export async function buildProductPageLink(shop, productId, variantId = null, productHandle = null, _shorten = true) {
  const shopHost = getShopDomainHost(shop);
  if (!shopHost) {
    logger.warn("[buildProductPageLink] Missing shop domain; skipping PDP link");
    return null;
  }

  if (!productId) {
    logger.warn("[buildProductPageLink] Missing product ID; skipping PDP link");
    return null;
  }

  let handle = (productHandle || "").trim() || null;
  if (!handle && shop.shopify_domain) {
    try {
      const raw = await getShopifyProductContextForReply(shop.shopify_domain, productId);
      handle = (raw?.handle || "").trim() || null;
    } catch (err) {
      logger.warn(
        `[buildProductPageLink] Handle lookup failed for ${productId}: ${err?.message || err}`
      );
    }
  }
  if (!handle) {
    // No session / product not found / missing scope — the PDP URL is
    // optional, so fall back to the checkout link instead of crashing the
    // whole Promise.all that built this alongside brand voice, product info,
    // and the checkout link.
    logger.warn(
      `[buildProductPageLink] Could not resolve product handle for ${productId} on ${shop.shopify_domain}; skipping PDP link`
    );
    return null;
  }

  // Prefix "pdp_" so analytics CTR (which only counts checkout links) doesn't
  // fold PDP clicks into the checkout-link denominator.
  const linkId = `pdp_${generateLinkId()}`;

  const variantIdMatch = variantId ? variantId.match(/\/(\d+)$/) : null;

  const pdpUrl = `https://${shopHost}/products/${handle}`;

  const params = new URLSearchParams();
  if (variantIdMatch) {
    params.set("variant", variantIdMatch[1]);
  }
  params.set("ref", `link_${linkId}`);
  params.set("utm_source", "instagram");
  params.set("utm_medium", "ig_dm");
  params.set("utm_campaign", "product_question");

  const finalUrl = `${pdpUrl}?${params.toString()}`;
  return { url: finalUrl, linkId };
}

/**
 * Build a Shopify checkout/cart link with UTMs and link_id
 * @param {Object} shop - Shop object with shopify_domain
 * @param {string} productId - Shopify product ID (gid format)
 * @param {string|null} variantId - Shopify variant ID (gid format, optional)
 * @param {number} qty - Quantity (default: 1)
 * @returns {Promise<{url: string, linkId: string}>} - Checkout URL and link ID
 */
export async function buildCheckoutLink(shop, productId, variantId = null, qty = 1, _shorten = true) {
  const shopHost = getShopDomainHost(shop);
  if (!shopHost) {
    throw new Error("Shop domain is required");
  }

  if (!productId) {
    throw new Error("Product ID is required");
  }

  // Generate unique link_id
  const linkId = generateLinkId();

  // Extract numeric IDs from GID format
  // Product ID format: gid://shopify/Product/123456789
  // Variant ID format: gid://shopify/ProductVariant/123456789
  const productIdMatch = productId.match(/\/(\d+)$/);

  // If variant_id is null, try to fetch the first variant from Shopify
  let finalVariantId = variantId;
  if (!finalVariantId) {
    try {
      // Get session from storage using shop domain
      const sessionId = `${shop.shopify_domain}_${process.env.SHOPIFY_API_KEY}`;
      const session = await sessionStorage.loadSession(sessionId);

      if (session && session.accessToken) {
        // Create GraphQL client using the session
        const admin = new shopify.clients.Graphql({ session });

        const response = await admin.graphql(`
          query getProduct($id: ID!) {
            product(id: $id) {
              id
              variants(first: 1) {
                nodes {
                  id
                }
              }
            }
          }
        `, {
          variables: { id: productId },
        });

        const json = await response.json();
        const variants = json.data?.product?.variants?.nodes || [];
        if (variants.length > 0) {
          finalVariantId = variants[0].id;
          logger.debug(`[buildCheckoutLink] Fetched first variant: ${finalVariantId}`);
        }
      }
    } catch (error) {
      // If we can't fetch the variant, continue without it
      console.warn(`[buildCheckoutLink] Could not fetch default variant for product ${productId}:`, error.message);
    }
  }

  // Validate variant_id is actually a variant ID (not a product ID)
  // Handle both GID format (gid://shopify/ProductVariant/123) and numeric format (123)
  let variantNumericId = null;
  if (finalVariantId) {
    // Check if it's a GID format with ProductVariant
    if (finalVariantId.includes("ProductVariant")) {
      const variantIdMatch = finalVariantId.match(/\/(\d+)$/);
      variantNumericId = variantIdMatch ? variantIdMatch[1] : null;
    } else if (typeof finalVariantId === "string" && /^\d+$/.test(finalVariantId)) {
      // If it's just a numeric string, use it directly
      variantNumericId = finalVariantId;
    } else if (typeof finalVariantId === "number") {
      // If it's a number, convert to string
      variantNumericId = String(finalVariantId);
    } else {
      // If variantId doesn't match expected formats, log warning and treat as null
      console.warn(`[buildCheckoutLink] Invalid variant_id format: ${finalVariantId} (type: ${typeof finalVariantId})`);
      variantNumericId = null;
    }
  }

  // Accept both gid format (gid://shopify/Product/123) and bare numeric IDs;
  // callers hold both formats depending on where the ID came from.
  const productNumericId = productIdMatch
    ? productIdMatch[1]
    : /^\d+$/.test(String(productId))
      ? String(productId)
      : null;
  if (!productNumericId) {
    throw new Error("Invalid product ID format");
  }

  // Always use the stateless cart permalink. We previously called MCP
  // update_cart here to get a "real" checkout URL back, but that URL is
  // a stateful checkout-session token: it has a TTL, expires once the
  // order is placed, and can be invalidated by a session change (e.g.
  // the customer entering the storefront password after the cart was
  // created in an anonymous session). DMs are long-lived and can be
  // clicked hours or days later, so Shopify's permalink — which
  // regenerates a fresh cart on every click — is the right primitive.
  let checkoutUrl;
  if (variantNumericId) {
    checkoutUrl = `https://${shopHost}/cart/${variantNumericId}:${qty}`;
  } else {
    checkoutUrl = `https://${shopHost}/cart/add?id=${productNumericId}&quantity=${qty}`;
  }

  // Attribution params — append to whichever URL we ended up with.
  // `attributes[ref]` is a Shopify cart attribute: it persists ON THE CART
  // and arrives in the order's note_attributes, so attribution survives even
  // when the customer leaves and completes the purchase in a later session.
  // The plain `ref` param only reaches us via the order's landing_site, which
  // covers same-session purchases; together they cover both cases.
  const params = new URLSearchParams({
    ref: `link_${linkId}`,
    "attributes[ref]": `link_${linkId}`,
    utm_source: "instagram",
    utm_medium: "ig_dm",
    utm_campaign: "dm_to_buy",
  });

  const separator = checkoutUrl.includes("?") ? "&" : "?";
  const finalUrl = `${checkoutUrl}${separator}${params.toString()}`;

  return {
    url: finalUrl,
    linkId: linkId,
  };
}

/**
 * Extract the link_id from an order's note_attributes (cart attributes).
 * Checkout links set `attributes[ref]=link_{id}` on the cart permalink; the
 * attribute persists on the cart and lands in the order payload, so this
 * works even when the customer completes the purchase in a LATER session
 * (where landing_site no longer carries the ref param).
 * @param {Array<{name: string, value: string}>|undefined} noteAttributes
 * @returns {string|null}
 */
export function extractLinkIdFromNoteAttributes(noteAttributes) {
  if (!Array.isArray(noteAttributes)) return null;
  const refAttr = noteAttributes.find((a) => a?.name === "ref");
  const value = refAttr?.value || "";
  return value.startsWith("link_") ? value.replace("link_", "") : null;
}

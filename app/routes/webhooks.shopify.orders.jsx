// Polyfill crypto for Shopify webhook validation
// The Shopify library expects crypto to be available globally
import crypto from "crypto";

// Make crypto available globally for Shopify library
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}
if (typeof global.crypto === "undefined") {
  global.crypto = crypto;
}

import { authenticate } from "../shopify.server";
import { getShopByDomain, recordAttribution } from "../lib/db.server";
import { extractLinkIdFromNoteAttributes } from "../lib/links.server";
import logger from "../lib/logger.server";

/**
 * Parse URL to extract link_id and UTM parameters
 * @param {string} url - The URL to parse
 * @returns {Object} - { linkId, utmSource, utmMedium, utmCampaign }
 */
function parseAttributionUrl(url) {
  if (!url) return null;

  try {
    // Shopify's order `landing_site` is typically a RELATIVE path
    // (e.g. "/cart/51139...:1?ref=link_abc123"), while `referring_site` is
    // usually an absolute URL. `new URL(relativePath)` throws "Invalid URL"
    // without a base, which previously made this function return null for
    // every landing_site and silently skip attribution. Supplying a base
    // resolves relative paths and is ignored for absolute URLs — we only
    // read query params, so the placeholder host is irrelevant.
    const urlObj = new URL(url, "https://shopify-attribution.local");
    const params = urlObj.searchParams;

    // Extract link_id from ref parameter (format: ref=link_{link_id})
    const ref = params.get("ref");
    let linkId = null;
    if (ref && ref.startsWith("link_")) {
      linkId = ref.replace("link_", "");
    }

    // Extract UTM parameters
    const utmSource = params.get("utm_source");
    const utmMedium = params.get("utm_medium");
    const utmCampaign = params.get("utm_campaign");

    return {
      linkId,
      utmSource,
      utmMedium,
      utmCampaign,
    };
  } catch (error) {
    console.error(`[webhook] Error parsing URL: ${url}`, error);
    return null;
  }
}

/**
 * Infer channel from UTM parameters
 * @param {string} utmMedium - UTM medium parameter
 * @param {string} utmSource - UTM source parameter
 * @returns {string|null} - 'dm', 'comment', or null
 */
function inferChannel(utmMedium, utmSource) {
  if (!utmMedium) return null;

  // Check for Instagram DM indicators
  if (utmMedium === "ig_dm" || utmMedium === "instagram_dm" || utmMedium === "dm") {
    return "dm";
  }

  // Check for Instagram comment indicators
  if (utmMedium === "ig_comment" || utmMedium === "instagram_comment" || utmMedium === "comment") {
    return "comment";
  }

  // Fallback: if source is instagram, default to dm
  if (utmSource === "instagram" && !utmMedium) {
    return "dm";
  }

  return null;
}

/**
 * orders/create webhook handler — revenue attribution for Instagram-driven
 * orders.
 *
 * Data minimization (relevant for protected customer data review):
 *   Although Shopify's orders/create payload contains customer PII
 *   (customer.email, customer.name, billing/shipping addresses, etc.), this
 *   handler intentionally only reads non-customer fields needed for
 *   attribution: order id, order_number, total_price, currency, landing_site,
 *   and referring_site. No customer.* field is ever read, persisted, or
 *   forwarded. The recordAttribution() call writes only orderId, linkId,
 *   channel, and amount to the attribution table — see
 *   app/lib/db.server.js -> recordAttribution.
 */
// Webhooks are POST-only. Bots and crawlers GET this URL anyway; without a
// loader, React Router tries to render the route as a page and logs a noisy
// "Matched leaf route ... does not have an element" warning. Answer GETs with
// a plain 405 instead.
export const loader = () => new Response("Method Not Allowed", { status: 405 });

export const action = async ({ request }) => {
  logger.debug(`[webhook] orders/create webhook received`);
  
  try {
    // Authenticate and verify the webhook
    const { shop, payload } = await authenticate.webhook(request);
    logger.debug(`[webhook] Authenticated orders/create webhook for shop: ${shop}`);

    // Get shop from database to get shop_id
    const shopData = await getShopByDomain(shop);
    if (!shopData) {
      console.error(`[webhook] Shop not found in database: ${shop}`);
      // Return success to prevent retries for shops we don't have
      return new Response(JSON.stringify({ received: true, error: "Shop not found" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Read ONLY non-PII fields from the payload. We deliberately do not
    // touch payload.customer or any address/email/phone field.
    const orderId = payload.id?.toString() || payload.order_number?.toString();
    const totalPrice = parseFloat(payload.total_price || payload.current_total_price || "0");
    const currency = payload.currency || payload.presentment_currency_code || "USD";
    const landingSite = payload.landing_site;
    const referringSite = payload.referring_site;

    logger.debug(`[webhook] Order data:`, {
      order_id: orderId,
      order_number: payload.order_number,
      total_price: totalPrice,
      currency,
      landing_site: landingSite,
      referring_site: referringSite,
    });

    // Attribution sources, most reliable first: cart attributes survive
    // cross-session purchases, landing_site/referring_site only cover
    // same-session ones.
    let attributionData = null;
    const noteAttrLinkId = extractLinkIdFromNoteAttributes(payload.note_attributes);
    if (noteAttrLinkId) {
      attributionData = {
        linkId: noteAttrLinkId,
        utmSource: "instagram",
        utmMedium: "ig_dm",
        utmCampaign: "dm_to_buy",
      };
      logger.debug(`[webhook] Attribution from cart attributes: link_${noteAttrLinkId}`);
    }

    if (!attributionData?.linkId && landingSite) {
      attributionData = parseAttributionUrl(landingSite);
      logger.debug(`[webhook] Parsed landing_site:`, attributionData);
    }

    if (!attributionData?.linkId && referringSite) {
      attributionData = parseAttributionUrl(referringSite);
      logger.debug(`[webhook] Parsed referring_site:`, attributionData);
    }

    // If we found a link_id, record attribution
    if (attributionData?.linkId) {
      const channel = inferChannel(attributionData.utmMedium, attributionData.utmSource);
      
      logger.debug(`[webhook] Recording attribution:`, {
        shop_id: shopData.id,
        order_id: orderId,
        link_id: attributionData.linkId,
        channel,
        amount: totalPrice,
        currency,
      });

      try {
        await recordAttribution({
          shopId: shopData.id,
          orderId: orderId,
          linkId: attributionData.linkId,
          channel: channel,
          amount: totalPrice,
          currency: currency,
        });

        logger.debug(`[webhook] Attribution recorded successfully for order ${orderId}`);
      } catch (attributionError) {
        console.error(`[webhook] Error recording attribution:`, attributionError);
        // Don't throw - we still want to return success to Shopify
        // Attribution errors shouldn't cause webhook retries
      }
    } else {
      logger.debug(`[webhook] No link_id found in order URLs - skipping attribution`);
    }

    // Return success response
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[webhook] Error processing orders/create webhook:`, error);
    console.error(`[webhook] Error stack:`, error.stack);
    
    // Return error response
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// No component/ErrorBoundary exports on purpose: exporting either makes
// React Router treat this as a page route, so crawler GETs render an empty
// page and log "Matched leaf route ... does not have an element" warnings.
// As a pure resource route, the loader's 405 is returned directly instead.


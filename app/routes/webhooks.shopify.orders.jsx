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

import { useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopByDomain, recordAttribution } from "../lib/db.server";

/**
 * Parse URL to extract link_id and UTM parameters
 * @param {string} url - The URL to parse
 * @returns {Object} - { linkId, utmSource, utmMedium, utmCampaign }
 */
function parseAttributionUrl(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
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

export const action = async ({ request }) => {
  console.log(`[webhook] orders/create webhook received`);
  
  try {
    // Authenticate and verify the webhook
    const { shop, topic, payload } = await authenticate.webhook(request);
    console.log(`[webhook] Authenticated orders/create webhook for shop: ${shop}`);

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

    // Parse order data
    const orderId = payload.id?.toString() || payload.order_number?.toString();
    const totalPrice = parseFloat(payload.total_price || payload.current_total_price || "0");
    const currency = payload.currency || payload.presentment_currency_code || "USD";
    const landingSite = payload.landing_site;
    const referringSite = payload.referring_site;

    console.log(`[webhook] Order data:`, {
      order_id: orderId,
      order_number: payload.order_number,
      total_price: totalPrice,
      currency,
      landing_site: landingSite,
      referring_site: referringSite,
    });

    // Try to extract attribution from landing_site first, then referring_site
    let attributionData = null;
    if (landingSite) {
      attributionData = parseAttributionUrl(landingSite);
      console.log(`[webhook] Parsed landing_site:`, attributionData);
    }

    if (!attributionData?.linkId && referringSite) {
      attributionData = parseAttributionUrl(referringSite);
      console.log(`[webhook] Parsed referring_site:`, attributionData);
    }

    // If we found a link_id, record attribution
    if (attributionData?.linkId) {
      const channel = inferChannel(attributionData.utmMedium, attributionData.utmSource);
      
      console.log(`[webhook] Recording attribution:`, {
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

        console.log(`[webhook] Attribution recorded successfully for order ${orderId}`);
      } catch (attributionError) {
        console.error(`[webhook] Error recording attribution:`, attributionError);
        // Don't throw - we still want to return success to Shopify
        // Attribution errors shouldn't cause webhook retries
      }
    } else {
      console.log(`[webhook] No link_id found in order URLs - skipping attribution`);
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

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}


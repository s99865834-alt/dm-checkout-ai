/**
 * Instagram Login (Business Login) OAuth callback
 * Exchanges authorization code for short-lived token, then long-lived token,
 * and saves auth with auth_type=instagram (no Facebook Page).
 * OAuth URL: https://www.instagram.com/oauth/authorize
 * Token exchange: https://api.instagram.com/oauth/access_token
 * Long-lived: https://graph.instagram.com/access_token
 */

import { redirect } from "react-router";
import { getShopByDomain } from "../lib/db.server";
import {
  saveMetaAuthForInstagram,
  INSTAGRAM_TOKEN_URL,
  INSTAGRAM_GRAPH_BASE,
  META_INSTAGRAM_APP_ID,
  META_INSTAGRAM_APP_SECRET,
} from "../lib/meta.server";

const PRODUCTION_URL = "https://dm-checkout-ai-production.up.railway.app";
const APP_URL = process.env.APP_URL || process.env.SHOPIFY_APP_URL || PRODUCTION_URL;

export async function loader({ request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // shop domain
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    const shop = state || "unknown";
    return redirect(
      `/app?error=${encodeURIComponent(errorDescription || error)}&shop=${encodeURIComponent(shop)}`
    );
  }

  if (!code || !state) {
    return redirect(
      `/app?error=${encodeURIComponent("Missing code or state. Please try connecting again.")}`
    );
  }

  const targetShop = state;
  const finalAppUrl = APP_URL.includes("railway.app") ? APP_URL : PRODUCTION_URL;
  const redirectUri = `${finalAppUrl}/meta/instagram-login/callback`;

  try {
    // 1. Exchange code for short-lived access token (POST api.instagram.com)
    const tokenForm = new URLSearchParams({
      client_id: META_INSTAGRAM_APP_ID,
      client_secret: META_INSTAGRAM_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(INSTAGRAM_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenForm.toString(),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error_type || tokenData.error_message) {
      throw new Error(tokenData.error_message || tokenData.error_type || "Token exchange failed");
    }

    // Response can be { access_token, user_id } or { data: [{ access_token, user_id }] }
    const payload = tokenData.data && tokenData.data[0] ? tokenData.data[0] : tokenData;
    const shortLivedToken = payload.access_token;
    const userId = payload.user_id;
    if (!shortLivedToken || !userId) {
      throw new Error("Invalid token response: missing access_token or user_id");
    }

    // 2. Exchange short-lived for long-lived token (GET graph.instagram.com)
    const longLivedUrl = `${INSTAGRAM_GRAPH_BASE}/access_token?` +
      `grant_type=ig_exchange_token&` +
      `client_secret=${encodeURIComponent(META_INSTAGRAM_APP_SECRET)}&` +
      `access_token=${encodeURIComponent(shortLivedToken)}`;

    const longRes = await fetch(longLivedUrl);
    const longData = await longRes.json();

    if (longData.error) {
      throw new Error(longData.error.message || "Long-lived token exchange failed");
    }

    const longLivedToken = longData.access_token;
    const expiresIn = longData.expires_in;
    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    if (!longLivedToken) {
      throw new Error("Invalid long-lived token response");
    }

    // 3. Resolve Instagram professional account ID (IG_ID) via GET /me – required for media/comments APIs
    const meUrl = `${INSTAGRAM_GRAPH_BASE}/me?fields=user_id,username,id&access_token=${encodeURIComponent(longLivedToken)}`;
    const meRes = await fetch(meUrl);
    const meData = await meRes.json();
    if (meData.error) {
      throw new Error(meData.error.message || "Failed to get Instagram account info");
    }
    const mePayload = (meData.data && meData.data[0]) ? meData.data[0] : meData;
    // Prefer "id" (Instagram Professional Account ID) so it matches webhook entry.id; fallback to user_id/userId
    const igBusinessId = mePayload.id != null ? String(mePayload.id) : (mePayload.user_id != null ? String(mePayload.user_id) : String(userId));

    // 4. Resolve shop and save auth (use IG business ID from /me for webhooks and API)
    const shopData = await getShopByDomain(targetShop);
    if (!shopData) {
      return redirect(`/app?error=${encodeURIComponent("Shop not found")}&shop=${encodeURIComponent(targetShop)}`);
    }

    await saveMetaAuthForInstagram(shopData.id, igBusinessId, longLivedToken, tokenExpiresAt);

    const shopName = targetShop.replace(".myshopify.com", "");
    const appClientId = process.env.SHOPIFY_API_KEY || "";
    const shopifyAdminAppUrl = `https://admin.shopify.com/store/${shopName}/apps/${appClientId}/app?connected=true`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: shopifyAdminAppUrl,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (err) {
    console.error("[oauth][instagram-login] Error:", err);
    const shop = state || "unknown";
    return redirect(
      `/app?error=${encodeURIComponent(err.message || "Instagram Login failed")}&shop=${encodeURIComponent(shop)}`
    );
  }
}

export default function InstagramLoginCallback() {
  return null;
}

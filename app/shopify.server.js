import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { createOrUpdateShop, getShopByDomain } from "./lib/db.server";
import { sendInstallAlert } from "./lib/install-alert.server";
import logger from "./lib/logger.server";

// Scopes must match shopify.app.toml and shopify.app.dev.toml [access_scopes].
// Using env var with hardcoded fallback so it's never accidentally empty.
const REQUIRED_SCOPES = ["read_products", "read_orders", "read_legal_policies", "read_content"];
const scopesFromEnv = process.env.SCOPES?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
const merged = new Set([...scopesFromEnv, ...REQUIRED_SCOPES]);
const scopes = [...merged];

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes,
  appUrl: (process.env.SHOPIFY_APP_URL || "").trim(),
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  // Required for Shopify's offline-access-token deprecation. When this flag
  // is on the library:
  //   1. Requests new offline access tokens with expiring=1 (60-min TTL,
  //      90-day refresh token).
  //   2. Auto-refreshes the access token via the stored refresh token when
  //      it's within 5 minutes of expiry.
  // Public apps must be fully migrated to expiring tokens by Jan 1, 2027.
  // See: https://shopify.dev/changelog/expiring-offline-access-tokens-required-for-all-public-apps-as-of-january-1-2027
  future: {
    expiringOfflineAccessTokens: true,
  },
  afterAuth: async ({ session }) => {
    // afterAuth fires on every OAuth completion — in the embedded-app
    // token-exchange flow that's essentially every fresh app load, not
    // just install/reinstall. createOrUpdateShop unconditionally resets
    // usage_count and plan (by design — it's the reinstall primitive),
    // so calling it here on every auth would wipe usage_count back to 0
    // and knock paid plans back to FREE every time the merchant opens
    // the app. We only want that behaviour on genuine installs or
    // reinstalls (where the shop is missing or was marked inactive by
    // the app/uninstalled webhook).
    logger.debug(`[afterAuth] OAuth completed for shop: ${session.shop}`);
    try {
      const existing = await getShopByDomain(session.shop);
      if (!existing) {
        const result = await createOrUpdateShop(session.shop, {
          plan: "FREE",
          monthly_cap: 100,
          active: true,
        });
        logger.debug(`[afterAuth] Created new shop ${session.shop}: active=${result.active}, usage_count=${result.usage_count}`);
        // Fire-and-forget so a mail hiccup can't slow down or break OAuth.
        sendInstallAlert(session.shop, "install").catch((e) =>
          console.error(`[afterAuth] Install alert failed for ${session.shop}:`, e?.message || e),
        );
      } else if (!existing.active) {
        // Reinstall path. App Store requires paid plans be re-approved
        // after an uninstall, so reset plan/usage here too.
        const result = await createOrUpdateShop(session.shop, {
          plan: "FREE",
          monthly_cap: 100,
          active: true,
          usage_count: 0,
        });
        logger.debug(`[afterAuth] Reactivated shop ${session.shop} on FREE: active=${result.active}, usage_count=${result.usage_count}`);
        sendInstallAlert(session.shop, "reinstall").catch((e) =>
          console.error(`[afterAuth] Reinstall alert failed for ${session.shop}:`, e?.message || e),
        );
      } else {
        logger.debug(`[afterAuth] Shop ${session.shop} already active; leaving plan/usage untouched`);
      }
    } catch (error) {
      console.error(`[afterAuth] Error creating/updating shop ${session.shop}:`, error);
      // Don't throw - allow OAuth to complete even if DB update fails
      // The shop can be created later when they access the app
    }
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;

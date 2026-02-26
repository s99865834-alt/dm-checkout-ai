import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { createOrUpdateShop } from "./lib/db.server";

// Scopes must match shopify.app.toml and shopify.app.dev.toml [access_scopes].
// Using env var with hardcoded fallback so it's never accidentally empty.
const REQUIRED_SCOPES = ["write_products", "read_products", "read_orders", "read_legal_policies", "read_content"];
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
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  afterAuth: async ({ session }) => {
    // Create or update shop in database when OAuth completes
    console.log(`[afterAuth] OAuth completed for shop: ${session.shop}`);
    try {
      const result = await createOrUpdateShop(session.shop, {
        plan: "FREE",
        monthly_cap: 25,
        active: true,
      });
      console.log(`[afterAuth] Shop ${session.shop} created/updated in database - active: ${result.active}, usage_count: ${result.usage_count}`);
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

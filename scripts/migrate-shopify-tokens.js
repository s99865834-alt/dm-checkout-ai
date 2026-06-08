/* eslint-env node */
/**
 * One-off script: migrate every stored Shopify offline access token from the
 * deprecated non-expiring format to the new expiring + refresh-token format.
 *
 * Why:
 *   Public apps must use expiring offline access tokens by Jan 1, 2027. After
 *   that date the Admin API rejects requests made with non-expiring tokens.
 *   See: https://shopify.dev/changelog/expiring-offline-access-tokens-required-for-all-public-apps-as-of-january-1-2027
 *
 * What it does:
 *   For each row in `Session` where isOnline=false AND refreshToken IS NULL,
 *   call Shopify's `migrate_offline_access_token` flow (token-exchange grant
 *   with expiring=1) and rewrite the row with the new access/refresh tokens.
 *
 * Idempotent:
 *   Sessions that already have a refresh token are skipped. Re-runs only act
 *   on rows still on the deprecated format.
 *
 * Important:
 *   The exchange is irreversible per-shop. Once we receive a new expiring
 *   token, Shopify revokes the old non-expiring one. Run on production once,
 *   AFTER the Prisma `refreshToken` / `refreshTokenExpires` migration has
 *   been applied AND the `future.expiringOfflineAccessTokens` flag has been
 *   deployed (so subsequent refreshes work too).
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-shopify-tokens.js [--dry-run] [--shop=<myshop.myshopify.com>]
 */

import { PrismaClient } from "@prisma/client";

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const OFFLINE_TOKEN_TYPE = "urn:shopify:params:oauth:token-type:offline-access-token";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const SHOP_FILTER = (() => {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--shop="));
  return arg ? arg.slice("--shop=".length) : null;
})();

const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error(
    "Missing SHOPIFY_API_KEY or SHOPIFY_API_SECRET in environment.",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

/**
 * Exchange one non-expiring offline token for an expiring one.
 *
 * @param {string} shop - e.g. "shop.myshopify.com"
 * @param {string} legacyAccessToken - the existing non-expiring token
 * @returns {Promise<object>} response body with access_token / refresh_token / expires_in / refresh_token_expires_in / scope
 */
async function exchangeToken(shop, legacyAccessToken) {
  const url = `https://${shop}/admin/oauth/access_token`;
  const body = {
    client_id: apiKey,
    client_secret: apiSecret,
    grant_type: TOKEN_EXCHANGE_GRANT,
    subject_token: legacyAccessToken,
    subject_token_type: OFFLINE_TOKEN_TYPE,
    requested_token_type: OFFLINE_TOKEN_TYPE,
    expiring: "1",
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(
      `Token exchange failed (${res.status}): ${text.slice(0, 500)}`,
    );
    err.status = res.status;
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      `Token exchange returned non-JSON response: ${text.slice(0, 500)}`,
    );
  }
}

async function migrateSession(session) {
  const result = {
    sessionId: session.id,
    shop: session.shop,
    status: "pending",
    error: null,
  };

  try {
    const tokenRes = await exchangeToken(session.shop, session.accessToken);

    if (!tokenRes.access_token || !tokenRes.refresh_token) {
      throw new Error(
        `Unexpected response shape (missing access_token or refresh_token): ${JSON.stringify(tokenRes).slice(0, 300)}`,
      );
    }

    const now = Date.now();
    const expiresIn = Number(tokenRes.expires_in) || 3600;
    const refreshExpiresIn = Number(tokenRes.refresh_token_expires_in) || 7776000;
    const expiresAt = new Date(now + expiresIn * 1000);
    const refreshExpiresAt = new Date(now + refreshExpiresIn * 1000);

    if (DRY_RUN) {
      result.status = "would-update";
      result.preview = {
        newExpires: expiresAt.toISOString(),
        newRefreshTokenExpires: refreshExpiresAt.toISOString(),
        newScope: tokenRes.scope,
      };
      return result;
    }

    await prisma.session.update({
      where: { id: session.id },
      data: {
        accessToken: tokenRes.access_token,
        scope: tokenRes.scope ?? session.scope,
        expires: expiresAt,
        refreshToken: tokenRes.refresh_token,
        refreshTokenExpires: refreshExpiresAt,
      },
    });

    result.status = "migrated";
    return result;
  } catch (err) {
    result.status = "failed";
    result.error = err?.message || String(err);
    return result;
  }
}

async function main() {
  const where = {
    isOnline: false,
    refreshToken: null,
  };
  if (SHOP_FILTER) where.shop = SHOP_FILTER;

  const sessions = await prisma.session.findMany({ where });

  console.log(
    `[migrate-tokens] Found ${sessions.length} non-expiring offline session(s)` +
      (SHOP_FILTER ? ` for shop=${SHOP_FILTER}` : "") +
      (DRY_RUN ? " (DRY-RUN: nothing will be written)" : ""),
  );

  if (sessions.length === 0) {
    console.log("[migrate-tokens] Nothing to do.");
    return;
  }

  const summary = { migrated: 0, "would-update": 0, failed: 0 };
  for (const session of sessions) {
    const r = await migrateSession(session);
    summary[r.status] = (summary[r.status] ?? 0) + 1;

    if (r.status === "failed") {
      console.error(
        `[migrate-tokens] ✗ shop=${r.shop} session=${r.sessionId}: ${r.error}`,
      );
    } else if (r.status === "would-update") {
      console.log(
        `[migrate-tokens] (dry-run) would update shop=${r.shop} session=${r.sessionId} → expires=${r.preview.newExpires} refreshExpires=${r.preview.newRefreshTokenExpires}`,
      );
    } else {
      console.log(
        `[migrate-tokens] ✓ migrated shop=${r.shop} session=${r.sessionId}`,
      );
    }
  }

  console.log("[migrate-tokens] Summary:", summary);

  if (summary.failed > 0) {
    console.error(
      "[migrate-tokens] Some sessions failed. The most common cause is the merchant having uninstalled the app — those tokens are already revoked and can be safely deleted from the Session table.",
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("[migrate-tokens] Fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

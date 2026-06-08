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
 *   node --env-file=.env scripts/migrate-shopify-tokens.js --list
 *     -> Lists candidate sessions without contacting Shopify. Use this to
 *        preview which rows the migration would target.
 *
 *   node --env-file=.env scripts/migrate-shopify-tokens.js [--shop=<myshop.myshopify.com>]
 *     -> Performs the real exchange. Each successful call permanently
 *        revokes the corresponding non-expiring token on Shopify's side, so
 *        DO NOT cancel mid-run; the new tokens are written to the Session
 *        row only after Shopify confirms the exchange.
 *
 * IMPORTANT: there is no `--dry-run` flag. Shopify revokes the legacy
 * non-expiring token the moment the exchange call succeeds, so any
 * "preview" that issues the request would burn the token without saving the
 * new one. Use `--list` to preview, then run the real command.
 */

import { PrismaClient } from "@prisma/client";

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const OFFLINE_TOKEN_TYPE = "urn:shopify:params:oauth:token-type:offline-access-token";

const argv = process.argv.slice(2);
const args = new Set(argv);
const LIST_ONLY = args.has("--list");
if (args.has("--dry-run")) {
  console.error(
    "[migrate-tokens] --dry-run was removed because the Shopify exchange " +
      "endpoint immediately revokes the legacy token on success. Use " +
      "`--list` to preview candidate sessions without contacting Shopify.",
  );
  process.exit(2);
}
const SHOP_FILTER = (() => {
  const arg = argv.find((a) => a.startsWith("--shop="));
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
      (LIST_ONLY ? " (LIST-ONLY: no Shopify calls, no DB writes)" : ""),
  );

  if (sessions.length === 0) {
    console.log("[migrate-tokens] Nothing to do.");
    return;
  }

  if (LIST_ONLY) {
    for (const session of sessions) {
      console.log(
        `[migrate-tokens] candidate shop=${session.shop} session=${session.id} scope=${session.scope ?? "(none)"}`,
      );
    }
    console.log(
      "[migrate-tokens] Re-run without --list to perform the actual exchange.",
    );
    return;
  }

  const summary = { migrated: 0, failed: 0 };
  for (const session of sessions) {
    const r = await migrateSession(session);
    summary[r.status] = (summary[r.status] ?? 0) + 1;

    if (r.status === "failed") {
      console.error(
        `[migrate-tokens] ✗ shop=${r.shop} session=${r.sessionId}: ${r.error}`,
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
      "[migrate-tokens] Some sessions failed. Common causes: the merchant " +
        "uninstalled the app (delete those Session rows), or the legacy token " +
        "was already revoked (the merchant just needs to open the embedded app " +
        "once and the new auth flow will issue a fresh expiring token).",
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

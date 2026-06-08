-- Adds the columns required by @shopify/shopify-app-session-storage-prisma >= 9
-- to persist Shopify's expiring offline access token rotation tokens. The
-- columns are nullable so existing sessions remain valid until the one-time
-- migration script (scripts/migrate-shopify-tokens.mjs) exchanges them for
-- expiring tokens.

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "refreshToken" TEXT;
ALTER TABLE "Session" ADD COLUMN     "refreshTokenExpires" TIMESTAMP(3);

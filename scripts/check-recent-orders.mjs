/**
 * Read-only diagnostic: fetch recent orders for a store via the Admin API and
 * print the fields the attribution webhook depends on (customAttributes /
 * note_attributes, landing/referrer URLs). Used to verify whether orders are
 * arriving without attribution markers or the markers are being missed.
 *
 * Usage: npx vite-node --config scripts/vite-node.config.mjs scripts/check-recent-orders.mjs <shop-domain>
 */
import "dotenv/config";
import { unauthenticated } from "../app/shopify.server";

const shopDomain = process.argv[2] || "lovebyluna.myshopify.com";

const QUERY = `
  query RecentOrders {
    orders(first: 10, reverse: true, sortKey: CREATED_AT) {
      nodes {
        name
        createdAt
        customAttributes { key value }
        landingPageUrl
        referrerUrl
        totalPriceSet { shopMoney { amount currencyCode } }
      }
    }
  }
`;

const { admin } = await unauthenticated.admin(shopDomain);
const response = await admin.graphql(QUERY);
const body = await response.json();

if (body.errors) {
  console.error("GraphQL errors:", JSON.stringify(body.errors, null, 2));
  process.exit(1);
}

const orders = body.data?.orders?.nodes || [];
console.log(`\n${orders.length} most recent orders for ${shopDomain}:\n`);
for (const o of orders) {
  console.log(`--- ${o.name} @ ${o.createdAt} — ${o.totalPriceSet?.shopMoney?.amount} ${o.totalPriceSet?.shopMoney?.currencyCode}`);
  console.log(`    customAttributes: ${JSON.stringify(o.customAttributes)}`);
  console.log(`    landingPageUrl:   ${o.landingPageUrl || "(null)"}`);
  console.log(`    referrerUrl:      ${o.referrerUrl || "(null)"}`);
}
process.exit(0);

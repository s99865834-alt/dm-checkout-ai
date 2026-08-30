/**
 * Read-only diagnostic: for every installed shop, report whether it is a real
 * business or a development/trial store, plus its order volume and revenue.
 *
 * Distinguishing signal is Shop.plan.partnerDevelopment (true for partner dev
 * stores) combined with actual order count. Used to strip fake installs out of
 * activation and ad-funnel math.
 *
 * Usage: npx vite-node --config scripts/vite-node.config.mjs scripts/classify-installs.mjs
 */
import "dotenv/config";
import { unauthenticated } from "../app/shopify.server";

const DOMAINS = [
  "4y0iib-ek.myshopify.com",
  "shanesecaresllc.myshopify.com",
  "fitjourneygoods.myshopify.com",
  "kupjy5-t5.myshopify.com",
  "lovebyluna.myshopify.com",
  "polished-holistic-skincare-and-dermatology-by-natasha-sandy-m-d.myshopify.com",
  "table-art-studios.myshopify.com",
  "peter-96737.myshopify.com",
  "wmdnd1-ia.myshopify.com",
  "snwscn-th.myshopify.com",
  "h0zcte-f1.myshopify.com",
  "nimqkw-sv.myshopify.com",
  "socialreplai.myshopify.com",
  "dmteststore-2.myshopify.com",
];

const QUERY = `
  query ClassifyShop {
    shop {
      name
      myshopifyDomain
      createdAt
      currencyCode
      plan { displayName partnerDevelopment shopifyPlus }
    }
    orders(first: 100, reverse: true, sortKey: CREATED_AT) {
      nodes { createdAt totalPriceSet { shopMoney { amount } } }
    }
  }
`;

const rows = [];

for (const domain of DOMAINS) {
  try {
    const { admin } = await unauthenticated.admin(domain);
    const response = await admin.graphql(QUERY);
    const body = await response.json();

    if (body.errors) {
      rows.push({ domain, status: `GraphQL error: ${JSON.stringify(body.errors).slice(0, 90)}` });
      continue;
    }

    const shop = body.data?.shop;
    const orders = body.data?.orders?.nodes || [];
    const revenue = orders.reduce(
      (sum, o) => sum + parseFloat(o.totalPriceSet?.shopMoney?.amount || "0"),
      0
    );

    rows.push({
      domain,
      name: shop?.name,
      plan: shop?.plan?.displayName,
      devStore: shop?.plan?.partnerDevelopment === true,
      created: shop?.createdAt?.slice(0, 10),
      orders: orders.length === 100 ? "100+" : orders.length,
      revenue: revenue.toFixed(2),
      currency: shop?.currencyCode,
    });
  } catch (error) {
    rows.push({ domain, status: `FAILED: ${(error.message || String(error)).slice(0, 90)}` });
  }
}

console.log("\n=== INSTALL CLASSIFICATION ===\n");
for (const r of rows) {
  if (r.status) {
    console.log(`${r.domain}\n    ${r.status}\n`);
    continue;
  }
  const verdict = r.devStore
    ? "DEV STORE"
    : r.orders === 0
      ? "no revenue"
      : "REAL BUSINESS";
  console.log(
    `${r.domain}\n` +
      `    name="${r.name}" plan="${r.plan}" devStore=${r.devStore} created=${r.created}\n` +
      `    orders=${r.orders} revenue=${r.revenue} ${r.currency}  =>  ${verdict}\n`
  );
}
process.exit(0);

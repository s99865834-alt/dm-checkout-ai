/**
 * Product context preview – proves what context the AI gets for comment replies.
 * Pick a mapped product and see the exact text sent to the model.
 * Uses the current request's admin session so it works when opened in the app.
 */
import { useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getProductMappings } from "../lib/db.server";
import { buildProductContextForAI } from "../lib/shopify-data.server";

const PRODUCT_CONTEXT_QUERY = `
  query getProductContext($productId: ID!) {
    product(id: $productId) {
      title
      handle
      description
      priceRangeV2 {
        minVariantPrice {
          amount
          currencyCode
        }
        maxVariantPrice {
          amount
          currencyCode
        }
      }
      options {
        name
        values
      }
      variants(first: 100) {
        nodes {
          id
          title
          price
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  const url = new URL(request.url);
  const productIdParam = url.searchParams.get("product_id");

  let productMappings = [];
  let selectedProductId = productIdParam || null;
  let productContextText = null;
  let variantCount = null;
  let error = null;

  if (shop?.id) {
    productMappings = await getProductMappings(shop.id);
    if (!selectedProductId && productMappings.length > 0) {
      selectedProductId = productMappings[0].product_id;
    }
    if (selectedProductId) {
      try {
        const { admin } = await authenticate.admin(request);
        const response = await admin.graphql(PRODUCT_CONTEXT_QUERY, {
          variables: { productId: selectedProductId },
        });
        const json = await response.json();
        const raw = json?.data?.product ?? null;
        if (raw) {
          variantCount = raw.variants?.nodes?.length ?? 0;
          const built = buildProductContextForAI(raw);
          productContextText = built.text;
        } else {
          error = json?.errors?.[0]?.message || "Could not load product (invalid ID or no access).";
        }
      } catch (e) {
        error = e.message || "Failed to fetch product context.";
      }
    }
  }

  return {
    shop,
    plan,
    productMappings,
    selectedProductId,
    productContextText,
    variantCount,
    error,
  };
};

export default function ProductContextPreview() {
  const {
    productMappings,
    selectedProductId,
    productContextText,
    variantCount,
    error,
  } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleSelect = (e) => {
    const id = e.target.value;
    if (id) setSearchParams({ product_id: id });
  };

  return (
    <s-page heading="Product context preview">
      <s-section>
        <s-text>
          This page shows the <strong>exact product context</strong> sent to the
          AI when someone comments on a post with a mapped product. Use it to
          verify that the AI has access to the mapped product (including
          single-variant / “no other colors”).
        </s-text>
      </s-section>

      {productMappings.length === 0 ? (
        <s-section>
          <s-text tone="subdued">
            No product mappings yet. Map a product to an Instagram post on the{" "}
            <s-link href="/app/instagram-feed">Instagram Feed</s-link> page,
            then return here.
          </s-text>
        </s-section>
      ) : (
        <>
          <s-section>
            <s-text variant="strong">Select a mapped product</s-text>
            <select
              value={selectedProductId || ""}
              onChange={handleSelect}
              style={{ marginTop: 8, minWidth: 280 }}
            >
              {productMappings.map((m) => (
                <option key={m.product_id} value={m.product_id}>
                  {m.product_id.replace("gid://shopify/Product/", "")} (media:{" "}
                  {m.ig_media_id?.slice(0, 12)}…)
                </option>
              ))}
            </select>
          </s-section>

          {error && (
            <s-section>
              <s-text tone="critical">{error}</s-text>
            </s-section>
          )}

          {productContextText != null && (
            <s-section>
              <s-text variant="strong">
                Variant count: {variantCount ?? "—"}
                {variantCount === 1 && " (single variant → AI must say no to “other colors/sizes”)"}
              </s-text>
              <s-text tone="subdued" style={{ display: "block", marginTop: 4 }}>
                Text below is exactly what the model sees in the PRODUCT CONTEXT
                block for comment replies.
              </s-text>
              <pre
                style={{
                  marginTop: 12,
                  padding: 16,
                  background: "#f5f5f5",
                  borderRadius: 8,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 13,
                  maxHeight: 400,
                  overflow: "auto",
                }}
              >
                {productContextText || "(empty)"}
              </pre>
            </s-section>
          )}
        </>
      )}
    </s-page>
  );
}

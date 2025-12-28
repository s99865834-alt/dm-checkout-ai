import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuth } from "../lib/meta.server";
import { getInstagramMedia } from "../lib/meta.server";
import { getProductMappings, saveProductMapping, deleteProductMapping } from "../lib/db.server";
import { PlanGate } from "../components/PlanGate";
import shopify from "../shopify.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  const { admin } = await authenticate.admin(request);

  let metaAuth = null;
  let mediaData = null;
  let productMappings = [];
  let shopifyProducts = [];

  if (shop?.id) {
    metaAuth = await getMetaAuth(shop.id);

    if (metaAuth?.ig_business_id) {
      try {
        // Fetch Instagram media
        const mediaResult = await getInstagramMedia(metaAuth.ig_business_id, shop.id, { limit: 25 });
        mediaData = mediaResult;

        // Fetch product mappings
        productMappings = await getProductMappings(shop.id);
      } catch (error) {
        console.error("[instagram-feed] Error fetching media:", error);
      }
    }

    // Fetch Shopify products
    try {
      const response = await admin.graphql(`
        query getProducts($first: Int!) {
          products(first: $first) {
            nodes {
              id
              title
              handle
              variants(first: 10) {
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
        }
      `, {
        variables: { first: 50 },
      });

      const json = await response.json();
      shopifyProducts = json.data?.products?.nodes || [];
    } catch (error) {
      console.error("[instagram-feed] Error fetching Shopify products:", error);
    }
  }

  return {
    shop,
    plan,
    metaAuth,
    mediaData,
    productMappings,
    shopifyProducts,
  };
};

export const action = async ({ request }) => {
  const { shop } = await getShopWithPlan(request);
  await authenticate.admin(request);

  if (!shop?.id) {
    return { error: "Shop not found" };
  }

  const formData = await request.formData();
  const actionType = formData.get("action");
  const igMediaId = formData.get("igMediaId");
  const productId = formData.get("productId");
  const variantId = formData.get("variantId") || null;

  if (actionType === "save-mapping") {
    if (!igMediaId || !productId) {
      return { error: "Missing required fields" };
    }

    try {
      await saveProductMapping(shop.id, igMediaId, productId, variantId);
      return { success: true, message: "Product mapping saved successfully" };
    } catch (error) {
      console.error("[instagram-feed] Error saving mapping:", error);
      return { error: error.message || "Failed to save mapping" };
    }
  } else if (actionType === "delete-mapping") {
    if (!igMediaId) {
      return { error: "Missing Instagram media ID" };
    }

    try {
      await deleteProductMapping(shop.id, igMediaId);
      return { success: true, message: "Product mapping deleted successfully" };
    } catch (error) {
      console.error("[instagram-feed] Error deleting mapping:", error);
      return { error: error.message || "Failed to delete mapping" };
    }
  }

  return { error: "Invalid action" };
};

export default function InstagramFeedPage() {
  const { shop, plan, metaAuth, mediaData, productMappings, shopifyProducts } = useLoaderData();
  const fetcher = useFetcher();
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");

  const isConnected = !!metaAuth;
  const mappingsMap = new Map(productMappings.map((m) => [m.ig_media_id, m]));

  const handleSaveMapping = (mediaId) => {
    if (!selectedProduct) {
      alert("Please select a product");
      return;
    }

    const formData = new FormData();
    formData.append("action", "save-mapping");
    formData.append("igMediaId", mediaId);
    formData.append("productId", selectedProduct);
    if (selectedVariant) {
      formData.append("variantId", selectedVariant);
    }

    fetcher.submit(formData, { method: "post" });
    setSelectedMedia(null);
    setSelectedProduct("");
    setSelectedVariant("");
  };

  const handleDeleteMapping = (mediaId) => {
    if (!confirm("Are you sure you want to remove this product mapping?")) {
      return;
    }

    const formData = new FormData();
    formData.append("action", "delete-mapping");
    formData.append("igMediaId", mediaId);

    fetcher.submit(formData, { method: "post" });
  };

  const selectedProductData = shopifyProducts.find((p) => p.id === selectedProduct);
  const selectedProductVariants = selectedProductData?.variants?.nodes || [];

  return (
    <PlanGate requiredPlan="PRO" feature="instagram_feed">
      <s-page heading="Instagram Feed & Product Mapping">
        {shop && plan && (
          <s-section>
            <s-stack direction="inline" gap="base">
              <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
                {plan.name} Plan
              </s-badge>
            </s-stack>
          </s-section>
        )}

        {!isConnected ? (
          <s-section>
            <s-callout variant="warning" title="Instagram Not Connected">
              <s-paragraph>
                Please connect your Instagram Business account on the <s-link href="/app">Home</s-link> page to view your feed.
              </s-paragraph>
            </s-callout>
          </s-section>
        ) : !mediaData ? (
          <s-section>
            <s-callout variant="info" title="Loading">
              <s-paragraph>Fetching your Instagram posts...</s-paragraph>
            </s-callout>
          </s-section>
        ) : (
          <>
            <s-section heading="Your Instagram Posts">
              <s-paragraph>
                Map your Instagram posts to Shopify products. When customers comment or DM about a post, we'll know which product to show them.
              </s-paragraph>

              {mediaData.data && mediaData.data.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px", marginTop: "16px" }}>
                  {mediaData.data.map((media) => {
                    const mapping = mappingsMap.get(media.id);
                    const mappedProduct = mapping
                      ? shopifyProducts.find((p) => p.id === mapping.product_id)
                      : null;

                    return (
                      <s-box key={media.id} padding="base" borderWidth="base" borderRadius="base">
                        <s-stack direction="block" gap="base">
                          {media.media_url && (
                            <img
                              src={media.media_url}
                              alt={media.caption || "Instagram post"}
                              style={{ width: "100%", borderRadius: "8px" }}
                            />
                          )}
                          {media.caption && (
                            <s-text variant="subdued" style={{ fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                              {media.caption}
                            </s-text>
                          )}
                          <s-stack direction="inline" gap="tight">
                            {media.like_count !== undefined && (
                              <s-text variant="subdued">❤️ {media.like_count}</s-text>
                            )}
                            {media.comments_count !== undefined && (
                              <s-text variant="subdued">💬 {media.comments_count}</s-text>
                            )}
                          </s-stack>

                          {mapping ? (
                            <s-box padding="tight" borderWidth="base" borderRadius="base" background="success-subdued">
                              <s-stack direction="block" gap="tight">
                                <s-text variant="strong" tone="success">✅ Mapped to Product</s-text>
                                <s-text variant="subdued">{mappedProduct?.title || "Product"}</s-text>
                                <s-button
                                  variant="secondary"
                                  size="small"
                                  onClick={() => handleDeleteMapping(media.id)}
                                  disabled={fetcher.state !== "idle"}
                                >
                                  Remove Mapping
                                </s-button>
                              </s-stack>
                            </s-box>
                          ) : (
                            <s-box padding="tight" borderWidth="base" borderRadius="base" background="subdued">
                              <s-stack direction="block" gap="tight">
                                <s-text variant="subdued">Not mapped</s-text>
                                <s-button
                                  variant="primary"
                                  size="small"
                                  onClick={() => setSelectedMedia(media.id)}
                                  disabled={fetcher.state !== "idle"}
                                >
                                  Map to Product
                                </s-button>
                              </s-stack>
                            </s-box>
                          )}

                          {selectedMedia === media.id && (
                            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                              <s-stack direction="block" gap="base">
                                <label htmlFor={`product-${media.id}`}>
                                  <s-text variant="strong">Select Product:</s-text>
                                </label>
                                <select
                                  id={`product-${media.id}`}
                                  value={selectedProduct}
                                  onChange={(e) => {
                                    setSelectedProduct(e.target.value);
                                    setSelectedVariant(""); // Reset variant when product changes
                                  }}
                                  style={{ width: "100%", padding: "8px", borderRadius: "4px" }}
                                >
                                  <option value="">-- Select Product --</option>
                                  {shopifyProducts.map((product) => (
                                    <option key={product.id} value={product.id}>
                                      {product.title}
                                    </option>
                                  ))}
                                </select>

                                {selectedProduct && selectedProductVariants.length > 1 && (
                                  <>
                                    <label htmlFor={`variant-${media.id}`}>
                                      <s-text variant="strong">Select Variant (Optional):</s-text>
                                    </label>
                                    <select
                                      id={`variant-${media.id}`}
                                      value={selectedVariant}
                                      onChange={(e) => setSelectedVariant(e.target.value)}
                                      style={{ width: "100%", padding: "8px", borderRadius: "4px" }}
                                    >
                                      <option value="">-- Default Variant --</option>
                                      {selectedProductVariants.map((variant) => (
                                        <option key={variant.id} value={variant.id}>
                                          {variant.title} - ${variant.price}
                                        </option>
                                      ))}
                                    </select>
                                  </>
                                )}

                                <s-stack direction="inline" gap="tight">
                                  <s-button
                                    variant="primary"
                                    size="small"
                                    onClick={() => handleSaveMapping(media.id)}
                                    disabled={!selectedProduct || fetcher.state !== "idle"}
                                  >
                                    Save Mapping
                                  </s-button>
                                  <s-button
                                    variant="secondary"
                                    size="small"
                                    onClick={() => {
                                      setSelectedMedia(null);
                                      setSelectedProduct("");
                                      setSelectedVariant("");
                                    }}
                                  >
                                    Cancel
                                  </s-button>
                                </s-stack>
                              </s-stack>
                            </s-box>
                          )}
                        </s-stack>
                      </s-box>
                    );
                  })}
                </div>
              ) : (
                <s-paragraph>No Instagram posts found.</s-paragraph>
              )}
            </s-section>
          </>
        )}

        {fetcher.data?.success && (
          <s-banner tone="success">
            <s-text>{fetcher.data.message}</s-text>
          </s-banner>
        )}

        {fetcher.data?.error && (
          <s-banner tone="critical">
            <s-text>{fetcher.data.error}</s-text>
          </s-banner>
        )}
      </s-page>
    </PlanGate>
  );
}


import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuth, getMetaAuthWithRefresh, getInstagramMedia } from "../lib/meta.server";
import { getProductMappings, saveProductMapping, deleteProductMapping, getSettings, updateSettings, cleanupDuplicateProductMappings } from "../lib/db.server";
import { PlanGate } from "../components/PlanGate";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  const { admin } = await authenticate.admin(request);

  let metaAuth = null;
  let mediaData = null;
  let productMappings = [];
  let shopifyProducts = [];
  let settings = null;

  if (shop?.id) {
    // Get settings for enabled_post_ids
    settings = await getSettings(shop.id);
    
    metaAuth = await getMetaAuth(shop.id);
    // Use refreshed auth so token is valid (important for Instagram Login 60-day tokens)
    const authRefreshed = metaAuth ? await getMetaAuthWithRefresh(shop.id) : null;
    const effectiveAuth = authRefreshed || metaAuth;

    if (effectiveAuth?.ig_business_id || effectiveAuth?.auth_type === "instagram") {
      try {
        // Fetch Instagram media (uses /me/media for Instagram Login, /{id}/media for Facebook Login)
        const mediaResult = await getInstagramMedia(effectiveAuth.ig_business_id || "", shop.id, { limit: 25 });
        mediaData = mediaResult;

        // Clean up any duplicate product mappings before fetching
        await cleanupDuplicateProductMappings(shop.id);

        // Fetch product mappings
        productMappings = await getProductMappings(shop.id);
        
        // Check for mappings with null variant_id and try to fix them
        const nullVariantMappings = productMappings.filter(m => !m.variant_id);
        if (nullVariantMappings.length > 0) {
          console.log(`[instagram-feed] Found ${nullVariantMappings.length} mappings with null variant_id, attempting to fix...`);
          
          // Try to fetch and update variants for mappings with null variant_id
          for (const mapping of nullVariantMappings) {
            try {
              const response = await admin.graphql(`
                query getProduct($id: ID!) {
                  product(id: $id) {
                    id
                    variants(first: 1) {
                      nodes {
                        id
                      }
                    }
                  }
                }
              `, {
                variables: { id: mapping.product_id },
              });

              const json = await response.json();
              const variants = json.data?.product?.variants?.nodes || [];
              
              if (variants.length > 0) {
                await saveProductMapping(shop.id, mapping.ig_media_id, mapping.product_id, variants[0].id);
                console.log(`[instagram-feed] Updated mapping for media ${mapping.ig_media_id} with variant ${variants[0].id}`);
              }
            } catch (error) {
              console.error(`[instagram-feed] Error updating mapping for media ${mapping.ig_media_id}:`, error);
            }
          }
          
          // Re-fetch mappings after updates
          productMappings = await getProductMappings(shop.id);
        }
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
    settings,
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
  const togglePost = formData.get("togglePost"); // "enable" or "disable"
  const postId = formData.get("postId");

  if (actionType === "toggle-post-automation") {
    if (!postId) {
      return { error: "Missing post ID" };
    }

    try {
      // Get current settings
      const currentSettings = await getSettings(shop.id);
      const currentEnabledPosts = currentSettings?.enabled_post_ids || [];
      
      let newEnabledPosts;
      if (togglePost === "enable") {
        // Add post to enabled list if not already there
        newEnabledPosts = currentEnabledPosts.includes(postId)
          ? currentEnabledPosts
          : [...currentEnabledPosts, postId];
      } else {
        // Remove post from enabled list
        newEnabledPosts = currentEnabledPosts.filter((id) => id !== postId);
      }

      await updateSettings(shop.id, {
        enabled_post_ids: newEnabledPosts,
      });

      return { success: true, message: `Post automation ${togglePost === "enable" ? "enabled" : "disabled"}` };
    } catch (error) {
      console.error("[instagram-feed] Error toggling post automation:", error);
      return { error: error.message || "Failed to toggle post automation" };
    }
  } else if (actionType === "save-mapping") {
    if (!igMediaId || !productId) {
      return { error: "Missing required fields" };
    }

    try {
      const { admin } = await authenticate.admin(request);
      
      // Always fetch the first variant and handle from Shopify (even if one was selected)
      // This ensures we always have variant_id and product_handle stored for PDP URLs
      let finalVariantId = variantId;
      let productHandle = null;

      try {
        const response = await admin.graphql(`
          query getProduct($id: ID!) {
            product(id: $id) {
              id
              handle
              variants(first: 1) {
                nodes {
                  id
                }
              }
            }
          }
        `, {
          variables: { id: productId },
        });

        const json = await response.json();
        const product = json.data?.product;
        const variants = product?.variants?.nodes || [];
        productHandle = product?.handle?.trim() || null;

        if (variants.length > 0) {
          // Use the selected variant if provided, otherwise use the first variant
          finalVariantId = variantId || variants[0].id;
          console.log(`[instagram-feed] Saving mapping with variant: ${finalVariantId} (selected: ${variantId || 'auto'}), handle: ${productHandle || '(none)'}`);
        } else {
          console.warn(`[instagram-feed] Product ${productId} has no variants - this should not happen in Shopify`);
          // Don't save if there are no variants - this is an error condition
          return { error: "Product has no variants. Every Shopify product must have at least one variant." };
        }
      } catch (graphqlError) {
        console.error("[instagram-feed] Error fetching product variants:", graphqlError);
        return { error: `Failed to fetch product variants: ${graphqlError.message}` };
      }

      // Ensure we have a variant_id before saving
      if (!finalVariantId) {
        return { error: "Could not determine variant ID for product" };
      }

      await saveProductMapping(shop.id, igMediaId, productId, finalVariantId, productHandle);
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
  const { shop, plan, metaAuth, mediaData, productMappings, shopifyProducts, settings } = useLoaderData();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");

  // Revalidate data after successful save/delete operations
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.success) {
        // Small delay to ensure database is updated
        setTimeout(() => {
          revalidator.revalidate();
        }, 100);
      }
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  // Check plan access directly from loader data
  // Product mapping is available for Growth+ (Growth and PRO tiers)
  const planHierarchy = { FREE: 0, GROWTH: 1, PRO: 2 };
  const currentPlanLevel = planHierarchy[plan?.name] || 0;
  const requiredPlanLevel = planHierarchy["GROWTH"] || 0;
  const hasAccess = currentPlanLevel >= requiredPlanLevel;

  const isConnected = !!metaAuth;
  const mappingsMap = new Map(productMappings.map((m) => [m.ig_media_id, m]));
  const enabledPostIds = settings?.enabled_post_ids || [];
  
  // Helper to check if a post has automation enabled
  // If enabledPostIds is empty, all posts are enabled by default
  const isPostAutomationEnabled = (postId) => {
    if (enabledPostIds.length === 0) {
      return true; // All posts enabled by default
    }
    return enabledPostIds.includes(postId);
  };

  const handleTogglePostAutomation = (postId, currentlyEnabled) => {
    const formData = new FormData();
    formData.append("action", "toggle-post-automation");
    formData.append("postId", postId);
    formData.append("togglePost", currentlyEnabled ? "disable" : "enable");

    fetcher.submit(formData, { method: "post" });
  };

  if (!hasAccess) {
    return (
      <s-page heading="Instagram Feed & Product Mapping">
        <s-callout variant="info" title="Instagram Feed requires Growth plan">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <s-text>
                This feature is available on the <s-text variant="strong">Growth</s-text> plan or higher.
              </s-text>
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Upgrade to unlock Instagram Feed, product mapping, and comment reply automation.
              </s-text>
            </s-paragraph>
            <s-button href="/app/billing/select" variant="primary">
              Upgrade to Growth
            </s-button>
          </s-stack>
        </s-callout>
      </s-page>
    );
  }

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
              <s-stack direction="block" gap="base">
                <s-paragraph>
                  Map your Instagram posts to Shopify products and control automation for each post. When customers comment or DM about a post, we'll know which product to show them.
                </s-paragraph>
                <s-paragraph>
                  <s-text variant="subdued">
                    Use the checkboxes below each post to enable/disable AI automation for that specific post. By default, all posts have automation enabled.
                  </s-text>
                </s-paragraph>
            {metaAuth?.auth_type === "instagram" && (
              <s-callout variant="info" title="Comment replies require Facebook Login">
                <s-paragraph>
                  Instagram Login supports DMs but cannot send private comment replies. Connect via Facebook on the Home page to enable comment automation.
                </s-paragraph>
              </s-callout>
            )}

              {mediaData.data && mediaData.data.length > 0 ? (
                <div className="srMediaGrid">
                  {mediaData.data.map((media) => {
                    const mapping = mappingsMap.get(media.id);
                    const mappedProduct = mapping
                      ? shopifyProducts.find((p) => p.id === mapping.product_id)
                      : null;
                    const mappedVariant = mapping && mappedProduct && mapping.variant_id
                      ? mappedProduct.variants?.nodes?.find((v) => v.id === mapping.variant_id)
                      : null;
                    const automationEnabled = isPostAutomationEnabled(media.id);

                    return (
                      <s-box key={media.id} padding="base" borderWidth="base" borderRadius="base">
                        <s-stack direction="block" gap="base">
                          {media.media_url && (
                            <img
                              src={media.media_url}
                              alt={media.caption || "Instagram post"}
                              className="srMediaImage"
                            />
                          )}
                          {media.caption && (
                            <s-text variant="subdued" className="srClamp2">
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

                          {/* Automation Toggle */}
                          <s-box padding="tight" borderWidth="base" borderRadius="base" background={automationEnabled ? "success-subdued" : "subdued"}>
                            <s-stack direction="inline" gap="base" alignment="space-between">
                              <s-stack direction="block" gap="tight">
                                <s-text variant="strong">
                                  {automationEnabled ? "✅ Automation Enabled" : "❌ Automation Disabled"}
                                </s-text>
                                <s-text variant="subdued">
                                  {automationEnabled
                                    ? "AI will respond to comments/DMs on this post"
                                    : "AI will NOT respond to comments/DMs on this post"}
                                </s-text>
                              </s-stack>
                              <label className="srCheckboxLabel">
                                <input
                                  type="checkbox"
                                  checked={automationEnabled}
                                  onChange={() => handleTogglePostAutomation(media.id, automationEnabled)}
                                  disabled={fetcher.state !== "idle"}
                                />
                              </label>
                            </s-stack>
                          </s-box>

                          {mapping ? (
                            <s-box padding="tight" borderWidth="base" borderRadius="base" background="success-subdued">
                              <s-stack direction="block" gap="tight">
                                <s-text variant="strong" tone="success">✅ Mapped to Product</s-text>
                                <s-text variant="subdued">
                                  {mappedProduct?.title || "Product"}
                                  {mappedVariant && ` (${mappedVariant.title})`}
                                </s-text>
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
                                  className="srSelect"
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
                                      className="srSelect"
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
              </s-stack>
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
  );
}


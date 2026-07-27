import { memo, useCallback, useEffect, useState } from "react";
import { useFetcher, useRevalidator } from "react-router";

/**
 * "Your Instagram Posts" section of the app home page.
 *
 * Split out of app/routes/app._index.jsx for two reasons:
 * 1. Streaming: media + products arrive via a deferred loader promise, so this
 *    whole section renders inside <Suspense> after the page shell is visible.
 * 2. INP: the product-search input state lives in <ProductPicker>, so typing
 *    re-renders only the open picker instead of the entire home page.
 */

// Normalize product/variant IDs for lookup (DB may store/return GID or numeric)
const productIdMatch = (storedId, shopifyProductId) => {
  if (!storedId || !shopifyProductId) return false;
  const n = (id) => {
    if (id == null) return "";
    const s = String(id);
    const suffix = s.match(/\/(\d+)$/);
    return suffix ? suffix[1] : s;
  };
  return n(storedId) === n(shopifyProductId);
};

const variantIdMatch = (stored, nodes) => {
  if (!stored || !nodes?.length) return null;
  const n = (id) => (id == null ? "" : (String(id).match(/\/(\d+)$/)?.[1] ?? String(id)));
  return nodes.find((v) => n(v.id) === n(stored)) ?? null;
};

/**
 * Fixed-dimension placeholder rendered while the deferred media/products data
 * streams in. Mirrors the real grid (same CSS classes, square image slots) so
 * the swap to real content causes no layout shift.
 */
export function PostsSectionSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <span className="srCardDesc">
        Map posts to Shopify products so the AI knows which product to link when customers DM or comment. Use the toggles to enable or disable automation per post.
      </span>
      <div className="srMediaGrid">
        {Array.from({ length: 6 }).map((_, i) => (
          <s-box key={i} padding="base" borderWidth="base" borderRadius="base">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div className="srSkeleton srSkeletonImage" />
              <div className="srSkeleton srSkeletonLine" style={{ width: "85%" }} />
              <div className="srSkeleton srSkeletonLine" style={{ width: "55%" }} />
              <div className="srSkeleton srSkeletonBox" />
              <div className="srSkeleton srSkeletonBox" />
            </div>
          </s-box>
        ))}
      </div>
    </div>
  );
}

/**
 * Product picker for mapping a post. Owns the search input state so keystrokes
 * only re-render this component (INP), and debounces the search action.
 */
const ProductPicker = memo(function ProductPicker({ mediaId, products, busy, onSave, onCancel, onProductsDiscovered }) {
  const searchFetcher = useFetcher();
  const revalidator = useRevalidator();
  const [productSearch, setProductSearch] = useState("");
  const [pickerResults, setPickerResults] = useState(null); // null = no active search
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");

  // Product search results: show them in the picker and let the parent merge
  // them into its product cache so mapped-product lookups work after save.
  useEffect(() => {
    if (searchFetcher.state !== "idle" || !searchFetcher.data?.success) return;
    if (searchFetcher.data.actionType !== "search-products") return;
    const results = searchFetcher.data.products || [];
    setPickerResults(results);
    onProductsDiscovered(results);
  }, [searchFetcher.state, searchFetcher.data, onProductsDiscovered]);

  // Debounced product search.
  useEffect(() => {
    const term = productSearch.trim();
    if (!term) {
      setPickerResults(null);
      return;
    }
    const timer = setTimeout(() => {
      searchFetcher.submit({ action: "search-products", search: term }, { method: "post" });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch]);

  const selectedProductData = (products || []).find((p) => p.id === selectedProduct);
  const selectedProductVariants = selectedProductData?.variants?.nodes || [];
  const pickerProducts = pickerResults ?? (products || []);
  const searchPending = searchFetcher.state !== "idle";

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <label htmlFor={`product-${mediaId}`}>
          <span className="srGridTextStrong">Select Product:</span>
        </label>
        {(products || []).length === 0 && pickerResults === null && !productSearch ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span className="srGridTextSubdued">
              No products to show. Your store may have no products, or the list could not be loaded.
            </span>
            <s-button
              variant="secondary"
              size="small"
              onClick={() => revalidator.revalidate()}
              disabled={revalidator.state === "loading"}
            >
              {revalidator.state === "loading" ? "Loading…" : "Retry"}
            </s-button>
          </div>
        ) : (
          <>
            <input
              id={`product-${mediaId}`}
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search your products by name…"
              className="srInput"
              autoComplete="off"
            />
            {/* Live results list: always visible, updates as the merchant types. */}
            <div className="srProductList" role="listbox" aria-label="Products">
              {searchPending && (
                <div className="srProductListMsg">Searching…</div>
              )}
              {!searchPending && pickerResults !== null && pickerResults.length === 0 && (
                <div className="srProductListMsg">
                  No products match &ldquo;{productSearch.trim()}&rdquo;.
                </div>
              )}
              {/* Keep the current selection visible even if it's not in the latest results. */}
              {selectedProductData && !pickerProducts.some((p) => p.id === selectedProduct) && (
                <button
                  type="button"
                  className="srProductListItem srProductListItemActive"
                  onClick={() => { setSelectedProduct(""); setSelectedVariant(""); }}
                  role="option"
                  aria-selected="true"
                >
                  <span className="srProductListTitle">{selectedProductData.title}</span>
                  <span className="srProductListCheck">✓</span>
                </button>
              )}
              {pickerProducts.map((p) => {
                const isActive = selectedProduct === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`srProductListItem ${isActive ? "srProductListItemActive" : ""}`}
                    onClick={() => {
                      setSelectedProduct(isActive ? "" : p.id);
                      setSelectedVariant("");
                    }}
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className="srProductListTitle">{p.title}</span>
                    {isActive && <span className="srProductListCheck">✓</span>}
                  </button>
                );
              })}
            </div>

            {selectedProduct && selectedProductVariants.length > 1 && (
              <>
                <label htmlFor={`variant-${mediaId}`}>
                  <span className="srGridTextStrong">Select Variant (Optional):</span>
                </label>
                <select
                  id={`variant-${mediaId}`}
                  value={selectedVariant}
                  onChange={(e) => setSelectedVariant(e.target.value)}
                  className="srSelect"
                >
                  <option value="">-- Default Variant --</option>
                  {selectedProductVariants.map((v) => (
                    <option key={v.id} value={v.id}>{v.title} - ${v.price}</option>
                  ))}
                </select>
              </>
            )}

            <div style={{ display: "flex", gap: "8px" }}>
              <s-button
                variant="primary" size="small"
                onClick={() => onSave(selectedProduct, selectedVariant)}
                disabled={!selectedProduct || busy}
              >
                Save Mapping
              </s-button>
              <s-button variant="secondary" size="small" onClick={onCancel}>
                Cancel
              </s-button>
            </div>
          </>
        )}
      </div>
    </s-box>
  );
});

export function PostsSection({ mediaData, shopifyProducts, productMappings, disabledPostIds, postFetcher }) {
  const revalidator = useRevalidator();

  // Instagram media pagination: accumulated pages + cursor for the next one.
  const mediaFetcher = useFetcher();
  const [localMedia, setLocalMedia] = useState(mediaData?.data || []);
  const [mediaAfterCursor, setMediaAfterCursor] = useState(
    mediaData?.paging?.next ? mediaData?.paging?.cursors?.after || null : null,
  );

  // Which post's product picker is open.
  const [selectedMedia, setSelectedMedia] = useState(null);

  // Local mappings/products state: updated from actions so we never need to
  // revalidate for mapping ops. Products found via search are merged in so
  // mapped-product lookups keep working after save.
  const [localMappings, setLocalMappings] = useState(productMappings || []);
  const [localProducts, setLocalProducts] = useState(shopifyProducts || []);
  const [localDisabledPostIds, setLocalDisabledPostIds] = useState(disabledPostIds || []);

  // Sync from loader data when it changes (initial load or full revalidation)
  useEffect(() => {
    setLocalMappings(productMappings || []);
  }, [productMappings]);

  useEffect(() => {
    if (shopifyProducts?.length) {
      setLocalProducts((prev) => {
        const seen = new Set(shopifyProducts.map((p) => p.id));
        // Keep any products discovered via search that aren't in the first page.
        return [...shopifyProducts, ...prev.filter((p) => !seen.has(p.id))];
      });
    }
  }, [shopifyProducts]);

  useEffect(() => {
    setLocalDisabledPostIds(disabledPostIds || []);
  }, [disabledPostIds]);

  // Sync media from the loader, but never shrink the list: revalidation (after
  // save/delete mapping) re-fetches only the first page, and we don't want a
  // merchant who paginated deep into their posts to lose their place.
  useEffect(() => {
    const firstPage = mediaData?.data || [];
    setLocalMedia((prev) => {
      if (prev.length > firstPage.length) return prev;
      return firstPage;
    });
    setMediaAfterCursor((prev) =>
      prev ?? (mediaData?.paging?.next ? mediaData?.paging?.cursors?.after || null : null),
    );
  }, [mediaData]);

  // Append newly loaded Instagram pages and advance the cursor.
  useEffect(() => {
    if (mediaFetcher.state !== "idle" || !mediaFetcher.data?.success) return;
    if (mediaFetcher.data.actionType !== "load-more-media") return;
    const newItems = mediaFetcher.data.media || [];
    setLocalMedia((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...newItems.filter((m) => !seen.has(m.id))];
    });
    const paging = mediaFetcher.data.paging || {};
    setMediaAfterCursor(paging.next ? paging.cursors?.after || null : null);
  }, [mediaFetcher.state, mediaFetcher.data]);

  // After postFetcher completes: update mappings locally or revalidate for toggle-post
  useEffect(() => {
    if (postFetcher.state !== "idle" || !postFetcher.data?.success) return;
    const { actionType } = postFetcher.data;

    if (actionType === "save-mapping" && postFetcher.data.mapping) {
      setLocalMappings((prev) => {
        const filtered = prev.filter((m) => m.ig_media_id !== postFetcher.data.mapping.ig_media_id);
        return [...filtered, postFetcher.data.mapping];
      });
      // Re-read from DB so the grid always reflects persisted state,
      // not just optimistic client state. If the row somehow never landed
      // in post_product_map, the optimistic mapping will disappear on
      // revalidate rather than hiding the bug.
      revalidator.revalidate();
    } else if (actionType === "delete-mapping" && postFetcher.data.igMediaId) {
      setLocalMappings((prev) => prev.filter((m) => m.ig_media_id !== postFetcher.data.igMediaId));
      revalidator.revalidate();
    } else if (actionType === "toggle-post-automation" && postFetcher.data.newDisabledIds) {
      setLocalDisabledPostIds(postFetcher.data.newDisabledIds);
    }
  }, [postFetcher.state, postFetcher.data, revalidator]);

  const mappingsMap = new Map((localMappings || []).map((m) => [m.ig_media_id, m]));
  const isPostEnabled = (postId) => !localDisabledPostIds.includes(postId);

  const handleTogglePost = (postId, currentlyEnabled) => {
    const fd = new FormData();
    fd.append("action", "toggle-post-automation");
    fd.append("postId", postId);
    fd.append("togglePost", currentlyEnabled ? "disable" : "enable");

    // Optimistic update; the action response re-syncs the authoritative list.
    setLocalDisabledPostIds((prev) =>
      currentlyEnabled ? [...prev, postId] : prev.filter((id) => id !== postId),
    );

    postFetcher.submit(fd, { method: "post" });
  };

  const handleLoadMoreMedia = () => {
    if (!mediaAfterCursor) return;
    mediaFetcher.submit(
      { action: "load-more-media", after: mediaAfterCursor },
      { method: "post" },
    );
  };

  const handleSaveMapping = (mediaId, productId, variantId) => {
    if (!productId) return;
    const fd = new FormData();
    fd.append("action", "save-mapping");
    fd.append("igMediaId", mediaId);
    fd.append("productId", productId);
    if (variantId) fd.append("variantId", variantId);
    postFetcher.submit(fd, { method: "post" });
    setSelectedMedia(null);
  };

  const handleDeleteMapping = (mediaId) => {
    const fd = new FormData();
    fd.append("action", "delete-mapping");
    fd.append("igMediaId", mediaId);
    postFetcher.submit(fd, { method: "post" });
  };

  const handleProductsDiscovered = useCallback((results) => {
    setLocalProducts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...results.filter((p) => !seen.has(p.id))];
    });
  }, []);

  const postBusy = postFetcher.state !== "idle";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <span className="srCardDesc">
        Map posts to Shopify products so the AI knows which product to link when customers DM or comment. Use the toggles to enable or disable automation per post.
      </span>

      {!mediaData ? (
        <span className="srCardDesc">Fetching your Instagram posts…</span>
      ) : localMedia.length > 0 ? (
        <div className="srMediaGrid">
          {localMedia.map((media) => {
            const mapping = mappingsMap.get(media.id);
            const mappedProduct = mapping
              ? (localProducts || []).find((p) => productIdMatch(mapping.product_id, p.id))
              : null;
            const mappedVariant = mapping && mappedProduct && mapping.variant_id
              ? variantIdMatch(mapping.variant_id, mappedProduct.variants?.nodes)
              : null;
            const automationEnabled = isPostEnabled(media.id);

            return (
              <s-box key={media.id} padding="base" borderWidth="base" borderRadius="base">
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {media.media_url && (
                    <img
                      src={media.media_url}
                      alt={media.caption || "Instagram post"}
                      className="srMediaImage"
                      loading="lazy"
                      width="300"
                      height="300"
                    />
                  )}
                  {media.caption && (
                    <span className="srGridTextSubdued srClamp2">{media.caption}</span>
                  )}
                  <div className="srGridMeta">
                    {media.like_count !== undefined && <span>❤️ {media.like_count}</span>}
                    {media.comments_count !== undefined && <span>💬 {media.comments_count}</span>}
                  </div>

                  {/* Per-post automation toggle */}
                  <s-box padding="tight" borderWidth="base" borderRadius="base"
                    background={automationEnabled ? "success-subdued" : "subdued"}>
                    <div className="srGridToggleRow srGridStatusBox">
                      <div className="srGridToggleInfo">
                        <span className="srGridTextStrong">
                          {automationEnabled ? "Automation Enabled" : "Automation Disabled"}
                        </span>
                        <span className="srGridTextSubdued">
                          {automationEnabled
                            ? "AI will respond to comments/DMs on this post"
                            : "AI will NOT respond to comments/DMs on this post"}
                        </span>
                      </div>
                      <label className="srToggle" aria-label="Automation for this post">
                        <input
                          type="checkbox"
                          checked={automationEnabled}
                          onChange={() => handleTogglePost(media.id, automationEnabled)}
                          disabled={postBusy}
                        />
                        <span className="srToggleTrack"><span className="srToggleThumb" /></span>
                      </label>
                    </div>
                  </s-box>

                  {/* Product mapping */}
                  {mapping ? (
                    <s-box padding="tight" borderWidth="base" borderRadius="base" background="success-subdued">
                      <div className="srGridStatusBox" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className="srGridTextSuccess">Mapped to Product</span>
                        <span className="srGridTextSubdued">
                          {mappedProduct?.title || (mapping.product_handle ? `Product: ${mapping.product_handle}` : "Product")}
                          {mappedVariant && ` (${mappedVariant.title})`}
                        </span>
                        <s-button
                          variant="secondary" size="small"
                          onClick={() => handleDeleteMapping(media.id)}
                          disabled={postBusy}
                        >
                          Remove Mapping
                        </s-button>
                      </div>
                    </s-box>
                  ) : (
                    <s-box padding="tight" borderWidth="base" borderRadius="base" background="subdued">
                      <div className="srGridStatusBox" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className="srGridTextSubdued">Not mapped</span>
                        <s-button
                          variant="primary" size="small"
                          onClick={() => setSelectedMedia(media.id)}
                          disabled={postBusy}
                        >
                          Map to Product
                        </s-button>
                      </div>
                    </s-box>
                  )}

                  {/* Product picker */}
                  {selectedMedia === media.id && (
                    <ProductPicker
                      mediaId={media.id}
                      products={localProducts || []}
                      busy={postBusy}
                      onSave={(productId, variantId) => handleSaveMapping(media.id, productId, variantId)}
                      onCancel={() => setSelectedMedia(null)}
                      onProductsDiscovered={handleProductsDiscovered}
                    />
                  )}
                </div>
              </s-box>
            );
          })}
        </div>
      ) : (
        <span className="srGridTextSubdued">No Instagram posts found.</span>
      )}

      {mediaFetcher.data?.error && (
        <span className="srGridTextSubdued">{mediaFetcher.data.error}</span>
      )}
      {mediaAfterCursor && (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <s-button
            variant="secondary"
            onClick={handleLoadMoreMedia}
            disabled={mediaFetcher.state !== "idle"}
          >
            {mediaFetcher.state !== "idle" ? "Loading more posts…" : "Load more posts"}
          </s-button>
        </div>
      )}
    </div>
  );
}

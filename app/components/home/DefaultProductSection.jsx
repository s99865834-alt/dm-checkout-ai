import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";

/**
 * Picker for the shop's default product: the one answered with on surfaces
 * where nothing else identifies a product.
 *
 * Post-by-post mapping covers feed posts. It cannot cover the rest, and that
 * gap is where the highest-intent messages land:
 *
 *  - A story reply. A story isn't in post_product_map and can't be, since it
 *    expires in a day, and the reply is usually a reaction ("love this", "😍")
 *    with no product name in it to search on.
 *  - A story mention, where someone tags the store. No text at all.
 *  - A shared post whose media we have no mapping for.
 *
 * Without a default, all three degrade to a homepage link, which carries no
 * cart attribute and can never be attributed to an order. With one, they sell
 * something. That's why this and story automation are the same tier.
 */
export function DefaultProductSection({ settings, shopifyProducts, fetcher }) {
  const revalidator = useRevalidator();

  const savedProductId = settings?.featured_product_id || "";
  const savedVariantId = settings?.featured_variant_id || "";

  const [productId, setProductId] = useState(savedProductId);
  const [variantId, setVariantId] = useState(savedVariantId);

  // Re-sync when the loader brings fresh settings, so a save made in another
  // tab (or the revalidate below) doesn't leave a stale selection on screen.
  useEffect(() => {
    setProductId(savedProductId);
    setVariantId(savedVariantId);
  }, [savedProductId, savedVariantId]);

  useEffect(() => {
    if (fetcher.data?.success) revalidator.revalidate();
    // revalidator identity changes every render, so it is deliberately not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const products = shopifyProducts || [];
  const selected = products.find((p) => p.id === productId);
  const variants = selected?.variants?.nodes || [];
  const busy = fetcher.state !== "idle";

  // The saved product may sit outside the 50 the loader fetched, in which case
  // there's no title to show. Say so rather than rendering an empty picker
  // that looks like nothing is set.
  const savedTitle = products.find((p) => p.id === savedProductId)?.title;

  const dirty = productId !== savedProductId || variantId !== savedVariantId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <span className="srCardDesc">
        Story replies and story mentions are answered automatically on your plan.
        Unlike a feed post, a story can&apos;t be mapped to a product: it expires in
        a day, and most replies are a reaction rather than a product name. Pick the
        product your stories are usually about and those messages get a real
        checkout link for it instead of your homepage. It covers shared posts you
        haven&apos;t mapped yet too.
      </span>

      {savedProductId ? (
        <span className="srGridTextSuccess">
          Currently offering: {savedTitle || "your saved product"}
          {savedVariantId && variants.find((v) => v.id === savedVariantId)
            ? ` (${variants.find((v) => v.id === savedVariantId).title})`
            : ""}
        </span>
      ) : (
        <span className="srGridTextSubdued">
          No default product set. Story replies and unmapped shares fall back to a
          homepage link.
        </span>
      )}

      <label htmlFor="default-product">
        <span className="srGridTextStrong">Default product</span>
      </label>
      <select
        id="default-product"
        className="srSelect"
        value={productId}
        onChange={(e) => {
          setProductId(e.target.value);
          setVariantId("");
        }}
      >
        <option value="">-- None --</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.title}</option>
        ))}
      </select>

      {selected && variants.length > 1 && (
        <>
          <label htmlFor="default-variant">
            <span className="srGridTextStrong">Variant (optional)</span>
          </label>
          <select
            id="default-variant"
            className="srSelect"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            <option value="">-- Default variant --</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{v.title} - ${v.price}</option>
            ))}
          </select>
        </>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <s-button
          variant="primary"
          size="small"
          disabled={!productId || !dirty || busy}
          onClick={() =>
            fetcher.submit(
              { action: "save-default-product", productId, variantId },
              { method: "post" },
            )
          }
        >
          {busy ? "Saving…" : "Save default product"}
        </s-button>
        {savedProductId && (
          <s-button
            variant="secondary"
            size="small"
            disabled={busy}
            onClick={() => fetcher.submit({ action: "clear-default-product" }, { method: "post" })}
          >
            Clear
          </s-button>
        )}
      </div>

      {fetcher.data?.error && (
        <span className="srGridTextSubdued">{fetcher.data.error}</span>
      )}
      {fetcher.data?.success && fetcher.data?.message && (
        <span className="srGridTextSuccess">{fetcher.data.message}</span>
      )}
    </div>
  );
}

/**
 * Shopify Storefront MCP client.
 *
 * Wraps JSON-RPC 2.0 calls to a merchant store's MCP endpoints:
 *   - Standard tools:     https://{shop}.myshopify.com/api/mcp
 *       search_shop_policies_and_faqs, get_cart, update_cart
 *   - UCP catalog tools:  https://{shop}.myshopify.com/api/ucp/mcp
 *       search_catalog, lookup_catalog, get_product
 *
 * Docs: https://shopify.dev/docs/apps/build/storefront-mcp/servers/storefront
 *
 * The MCP endpoints do NOT require authentication — they're storefront-scoped.
 * We just need the shop's *.myshopify.com domain.
 */

import logger from "./logger.server";

const DEFAULT_TIMEOUT_MS = 8000;

const DEFAULT_AGENT_PROFILE =
  process.env.UCP_AGENT_PROFILE_URL ||
  "https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json";

/**
 * Canonicalize whatever shop identifier the caller gave us into a bare
 * "{handle}.myshopify.com" host — strips protocol, trailing slashes, paths,
 * and ports. Returns null if we can't figure it out.
 */
function normalizeShopDomain(shop) {
  if (!shop) return null;
  let host = String(shop).trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "");
  host = host.split("/")[0];
  host = host.split(":")[0];
  if (!host.endsWith(".myshopify.com")) return null;
  return host;
}

function standardEndpoint(shopDomain) {
  return `https://${shopDomain}/api/mcp`;
}

function ucpEndpoint(shopDomain) {
  return `https://${shopDomain}/api/ucp/mcp`;
}

/**
 * Fetch with an AbortController-based timeout so a hanging MCP server
 * doesn't stall the DM automation worker.
 */
async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let _requestId = 0;
function nextRequestId() {
  _requestId = (_requestId + 1) % Number.MAX_SAFE_INTEGER;
  return _requestId;
}

/**
 * Invoke an MCP tool over JSON-RPC 2.0. Throws on network errors,
 * non-2xx responses, or JSON-RPC error payloads. Returns the `result`
 * object from the response (usually `{ content: [...] }`).
 */
async function callMcpTool(endpoint, toolName, toolArguments, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = {
    jsonrpc: "2.0",
    method: "tools/call",
    id: nextRequestId(),
    params: {
      name: toolName,
      arguments: toolArguments,
    },
  };

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `MCP ${toolName} HTTP ${response.status}: ${text.slice(0, 200)}`
    );
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(
      `MCP ${toolName} error ${json.error.code}: ${json.error.message}`
    );
  }
  return json.result;
}

/**
 * MCP tool responses come back as `{ content: [{ type: 'text', text: '...' }] }`.
 * Catalog/UCP responses usually encode a JSON payload inside the text block.
 * Try to parse it; if it isn't JSON, return the raw text.
 */
function parseToolContent(result) {
  if (!result) return null;
  if (Array.isArray(result.content)) {
    const textBlocks = result.content
      .filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => c.text);
    const joined = textBlocks.join("\n");
    try {
      return JSON.parse(joined);
    } catch {
      return joined || null;
    }
  }
  return result;
}

function ucpMeta() {
  return {
    "ucp-agent": { profile: DEFAULT_AGENT_PROFILE },
  };
}

// ---------------------------------------------------------------------------
// UCP catalog tools (/api/ucp/mcp)
// ---------------------------------------------------------------------------

/**
 * Free-text product search against the merchant's catalog.
 *
 * @param {string} shop - "{handle}.myshopify.com" or a full URL
 * @param {Object} catalog
 * @param {string} catalog.query
 * @param {Object} [catalog.context]  - { address_country, intent, ... }
 * @param {Object} [catalog.filters]
 * @param {Object} [catalog.pagination] - { cursor, limit }
 */
export async function searchCatalog(shop, catalog, opts = {}) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) throw new Error("searchCatalog: invalid shop domain");
  const result = await callMcpTool(
    ucpEndpoint(shopDomain),
    "search_catalog",
    { meta: ucpMeta(), catalog: catalog || {} },
    opts
  );
  return parseToolContent(result);
}

/**
 * Look up products/variants by GID. `ids` accepts up to 10.
 */
export async function lookupCatalog(shop, catalog, opts = {}) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) throw new Error("lookupCatalog: invalid shop domain");
  if (!Array.isArray(catalog?.ids) || catalog.ids.length === 0) {
    throw new Error("lookupCatalog: catalog.ids[] is required");
  }
  const result = await callMcpTool(
    ucpEndpoint(shopDomain),
    "lookup_catalog",
    { meta: ucpMeta(), catalog },
    opts
  );
  return parseToolContent(result);
}

/**
 * Full product detail with optional variant narrowing. Use this to resolve
 * size/color selections to a concrete variant.
 *
 * @param {Object} catalog
 * @param {string} catalog.id  - product or variant GID
 * @param {Array<{name:string,label:string}>} [catalog.selected]
 * @param {string[]} [catalog.preferences]
 * @param {Object} [catalog.context]
 */
export async function getProduct(shop, catalog, opts = {}) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) throw new Error("getProduct: invalid shop domain");
  if (!catalog?.id) throw new Error("getProduct: catalog.id is required");
  const result = await callMcpTool(
    ucpEndpoint(shopDomain),
    "get_product",
    { meta: ucpMeta(), catalog },
    opts
  );
  return parseToolContent(result);
}

// ---------------------------------------------------------------------------
// Standard storefront tools (/api/mcp)
// ---------------------------------------------------------------------------

/**
 * Ask a natural-language question about the merchant's policies and FAQs.
 * Returns Shopify's authoritative answer text — safer than scraping policy
 * pages ourselves.
 *
 * @param {string} shop
 * @param {string} query
 * @param {string} [context] - optional extra context, e.g. current product
 */
export async function searchShopPoliciesAndFaqs(shop, query, context, opts = {}) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) throw new Error("searchShopPoliciesAndFaqs: invalid shop domain");
  if (!query) throw new Error("searchShopPoliciesAndFaqs: query is required");
  const args = { query };
  if (context) args.context = context;
  const result = await callMcpTool(
    standardEndpoint(shopDomain),
    "search_shop_policies_and_faqs",
    args,
    opts
  );
  return parseToolContent(result);
}

/**
 * Read the current contents of a cart.
 */
export async function getCart(shop, cartId, opts = {}) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) throw new Error("getCart: invalid shop domain");
  if (!cartId) throw new Error("getCart: cartId is required");
  const result = await callMcpTool(
    standardEndpoint(shopDomain),
    "get_cart",
    { cart_id: cartId },
    opts
  );
  return parseToolContent(result);
}

/**
 * Create or update a Shopify cart and get back a checkout URL.
 *
 * The args are passed through verbatim so callers can use either
 * `lines` or `add_items` depending on what Shopify currently accepts.
 * Set `quantity: 0` to remove a line item.
 *
 * @param {string} shop
 * @param {Object} args
 * @param {string} [args.cart_id]     - omit to create a new cart
 * @param {Array}  [args.lines]       - [{ merchandise_id, quantity, line_item_id? }]
 * @param {Array}  [args.add_items]   - alternative name seen in Shopify docs
 */
export async function updateCart(shop, args, opts = {}) {
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) throw new Error("updateCart: invalid shop domain");
  if (!args || (!args.lines && !args.add_items)) {
    throw new Error("updateCart: args.lines[] or args.add_items[] is required");
  }
  const result = await callMcpTool(
    standardEndpoint(shopDomain),
    "update_cart",
    args,
    opts
  );
  return parseToolContent(result);
}

// ---------------------------------------------------------------------------
// Normalisers — adapt UCP catalog shapes to the Admin-API shapes the rest of
// the codebase already expects, so MCP can be a drop-in for
// searchProductsByDomain() / getShopifyProductContextForReply().
// ---------------------------------------------------------------------------

function pickArray(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function toProductGid(id) {
  if (!id) return null;
  if (typeof id !== "string") return null;
  if (id.startsWith("gid://shopify/Product/")) return id;
  if (id.startsWith("gid://shopify/ProductVariant/")) return null;
  if (/^\d+$/.test(id)) return `gid://shopify/Product/${id}`;
  return null;
}

function toVariantGid(id) {
  if (!id) return null;
  if (typeof id !== "string") return null;
  if (id.startsWith("gid://shopify/ProductVariant/")) return id;
  if (/^\d+$/.test(id)) return `gid://shopify/ProductVariant/${id}`;
  return null;
}

/**
 * Normalise a UCP/MCP product record to the shape that
 * searchProductsByDomain() returns so call sites don't have to branch.
 *
 *   { id, title, handle, variants: { nodes: [{ id, title, price }] } }
 */
function normalizeMcpProduct(raw) {
  if (!raw || typeof raw !== "object") return null;
  const productId =
    toProductGid(raw.id) ||
    toProductGid(raw.product_id) ||
    toProductGid(raw.productId) ||
    toProductGid(raw.gid);
  if (!productId) return null;

  const variantsRaw = pickArray(raw, ["variants"]);
  const variantNodes = variantsRaw
    .map((v) => {
      const vid =
        toVariantGid(v?.id) ||
        toVariantGid(v?.variant_id) ||
        toVariantGid(v?.variantId);
      if (!vid) return null;
      const price =
        typeof v?.price === "string"
          ? v.price
          : v?.price?.amount != null
          ? String(v.price.amount)
          : null;
      return {
        id: vid,
        title: v?.title || v?.name || null,
        price,
      };
    })
    .filter(Boolean);

  return {
    id: productId,
    title: raw.title || raw.name || "",
    handle: raw.handle || raw.slug || null,
    variants: { nodes: variantNodes },
  };
}

/**
 * Run search_catalog and return products in the same shape as
 * searchProductsByDomain(). Returns [] on any error or empty result so
 * callers can transparently fall back to the Admin API path.
 */
export async function searchCatalogNormalized(shop, query, opts = {}) {
  if (!query) return [];
  const shopDomain = normalizeShopDomain(shop);
  if (!shopDomain) return [];

  let parsed;
  try {
    parsed = await searchCatalog(
      shop,
      {
        query,
        pagination: { limit: opts.limit ?? 5 },
        ...(opts.context ? { context: opts.context } : {}),
      },
      opts
    );
  } catch (err) {
    logger.warn(`[mcp] search_catalog failed: ${err?.message || err}`);
    return [];
  }

  if (!parsed) return [];
  // Try several plausible response shapes.
  const productsArray = Array.isArray(parsed)
    ? parsed
    : pickArray(parsed, ["products", "results", "items", "nodes"]);
  return productsArray
    .map(normalizeMcpProduct)
    .filter((p) => p && p.variants.nodes.length > 0);
}

// ---------------------------------------------------------------------------
// Convenience wrapper: swallow errors, return null, log
// ---------------------------------------------------------------------------

/**
 * Wrap an MCP call in a try/catch that returns null on failure.
 * Use this at every call site where the existing Admin API path is the
 * fallback so a Storefront MCP outage doesn't break DM automation.
 */
export async function tryMcp(label, fn) {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`[mcp] ${label} failed: ${err?.message || err}`);
    return null;
  }
}

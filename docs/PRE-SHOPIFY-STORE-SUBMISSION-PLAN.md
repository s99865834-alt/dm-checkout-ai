# Pre–Shopify App Store Submission Plan

*Assuming Meta review passes. No code changes in this doc—planning only.*

---

## 1. Styling & UI

### 1.1 Consistency
- **Audit** all app routes (`app.*.jsx`) for consistent use of:
  - Shopify Polaris / `s-*` web components (you already use `s-page`, `s-section`, etc.)
  - Shared classes from `app/styles/global.css` (e.g. `srFlex1`, `srTable`, `srKpiGrid`, `srMediaGrid`) instead of one-off inline styles
- **Replace** remaining `style={{ ... }}` and ad-hoc classes with global or route-specific module classes so the app looks like one product, not a mix of patterns.

### 1.2 Global CSS
- **Review** `app/styles/global.css`: spacing, typography, and form controls are already centralized—ensure every screen that shows tables, grids, or forms uses these classes.
- **Legal/standalone pages**: `terms.jsx`, `privacy.jsx`, `_index/route.jsx` use `.srLegal` and `.srCenteredPage`—confirm they’re the only standalone styles and that they’re consistent with your brand.

### 1.3 Responsive & accessibility
- **Check** key flows (home, setup, Instagram feed, analytics, billing) on different viewport sizes; fix any overflow or cramped layouts.
- **Confirm** focus states and labels on form controls (you use `.srChoiceRow`, `.srCheckboxLabel`, etc.—ensure all interactive elements are covered).

---

## 2. Streamlining code & reducing extra requests

### 2.1 Loaders: avoid duplicate or sequential round-trips

| Route / area | Issue | Action |
|--------------|--------|--------|
| **app.instagram-feed.jsx** | Loader: `getMetaAuth` → `getMetaAuthWithRefresh` → `getInstagramMedia` → `cleanupDuplicateProductMappings` → `getProductMappings` → **per-mapping** GraphQL for null `variant_id` → **re-fetch** `getProductMappings` → then **separate** `admin.graphql` for products. Many sequential steps and N+1 for null variants. | Use a **single** GraphQL query (or batched) for fixing null variant mappings instead of one request per mapping. Consider doing variant fix in a background job or on save rather than on every page load. Combine or parallelize independent calls where possible (e.g. settings + metaAuth + media in parallel where order allows). |
| **app._index.jsx** | Loader: `getMetaAuth` → `getSettings` → `getBrandVoice` → then `getInstagramAccountInfo`; for Facebook Login also `checkWebhookStatus` and possibly `subscribeToWebhooks` then `checkWebhookStatus` again. | Run independent DB reads in parallel (`getSettings`, `getBrandVoice`, `getMetaAuth`). Call `getInstagramAccountInfo` only after you have metaAuth. Avoid double `checkWebhookStatus` when possible (e.g. only re-check after subscribe). |
| **app.setup.jsx** | Loader: `getMetaAuth` → then for Facebook path: `getMetaAuthWithRefresh` → `metaGraphAPI` (subscribed_apps) → `getInstagramAccountInfo`. Two auth fetches. | Use a single “get meta auth (refreshed)” helper so you don’t call `getMetaAuth` and then `getMetaAuthWithRefresh` separately. Fetch Instagram info in parallel with webhook check where logic allows. |
| **app.analytics.jsx** | Loader: `getAttributionRecords`, `getMessages`, `getMessageCount`, `getAnalytics`, and for PRO `getProAnalytics`—all sequential. | Run independent DB queries in **parallel** (e.g. attribution + messages + messageCount + analytics + proAnalytics where no dependency). |

### 2.2 Actions: avoid redundant auth/shop lookups

- **app._index.jsx** action: calls `authenticate.admin(request)` then for some branches calls `getShopWithPlan(request)` again—you already have session; use one place to get shop/plan and pass through.
- **app.billing.select.jsx** / **app.billing.activate.jsx**: loader and action both call `getShopWithPlan`—acceptable, but ensure actions don’t call both `authenticate.admin` and `getShopWithPlan` in a redundant way.
- **app.setup.jsx** / **app.instagram-feed.jsx** actions: same idea—single “auth + shop” resolution at the start of each action.

### 2.3 External / third-party calls

- **meta.server.js**: Multiple `fetch` calls for token exchange, long-lived token, and Graph API—ensure you’re not doing redundant token refresh when you already have a valid long-lived token (e.g. check expiry or “refresh if soon to expire” once per flow).
- **automation.server.js**: Shortening (is.gd, tinyurl) is two possible `fetch` calls—keep as fallback chain; no change needed unless you want to drop one provider.
- **shopify-data.server.js**: Single GraphQL for shop info is fine; used for AI context. Ensure callers don’t call it repeatedly when the same context could be reused or cached for a short period.

### 2.4 General

- **Batch GraphQL**: Where you need multiple Shopify resources (e.g. shop + products + mappings), prefer one or few batched GraphQL requests instead of many small ones.
- **Caching**: Consider short-lived in-memory or request-scoped cache for “get shop + plan” and “get meta auth (refreshed)” when the same request triggers multiple uses (e.g. loader + sub-calls). Only if it doesn’t complicate the code.

---

## 3. Test / debug / internal routes (before store submission)

- **app.billing.test.jsx**: Test billing—ensure this is **disabled or removed** in production or only reachable in development (e.g. env check or removed before submission).
- **app.attribution-debug.jsx**: Debug view—same as above; disable in production or restrict to internal/dev.
- **app.webhook-demo.jsx**: Webhook testing—decide if this stays for merchants or is dev-only; if dev-only, gate or remove for store build.
- **meta.test-webhook.jsx**, **meta.test-comments-api.jsx**, **meta.test-messages-api.jsx**: Meta API tests—ensure these are not publicly usable in a way that could confuse merchants or reviewers (e.g. behind admin/env or removed for store).
- **admin.jsx**: If this is an internal admin (e.g. queue, password-protected), ensure it’s not linked from merchant-facing UI and that it’s clearly for your support use only.

---

## 4. Logging & production readiness

- **Console usage**: You have `console.log` / `console.warn` / `console.error` across many files. For store submission:
  - **Keep** `console.error` for real errors (and consider a proper error reporting service later).
  - **Remove or gate** verbose `console.log` (e.g. “[home] Action called…”, “[home] Form data…”) behind something like `if (process.env.NODE_ENV === 'development')` or a small logger that no-ops in production, so reviewer and merchant consoles stay clean.

---

## 5. Shopify App Store requirements (checklist)

- **Session tokens**: App uses session-based auth; confirm no reliance on third-party cookies for core flows.
- **OAuth first**: Install flow does OAuth before other steps.
- **Scopes**: Only request scopes you need; document why each is used (for review).
- **Billing**: Test full billing flow (subscribe, upgrade, usage) with Shopify Billing API on a development store.
- **Compliance webhooks**: Subscribe to compliance webhooks as required by Shopify.
- **Domains**: No “Shopify” or “Example” in app URLs.
- **Listing**: One App Store listing in primary language; add app icon (1200×1200), description, screenshots.
- **Contacts**: Emergency contact (email + phone) and add app-submissions@shopify.com and noreply@shopify.com to allowed senders so you get review emails.
- **Policies**: Privacy policy and terms (you have `privacy.jsx` and `terms.jsx`) linked from the app and listed where Shopify asks.

---

## 6. Suggested order of work

1. **Gating/removal of test routes** (billing test, attribution debug, Meta test endpoints, webhook demo if dev-only)—so store build doesn’t expose internal tools.
2. **Reduce loader round-trips** (parallelize DB/API in app._index, app.setup, app.analytics; batch or defer variant fix in app.instagram-feed).
3. **Single “auth + shop” in actions** (avoid redundant `getShopWithPlan` / `authenticate.admin` in same action).
4. **Styling pass** (replace inline styles, align on global classes, quick responsive and a11y check).
5. **Logging cleanup** (strip or gate verbose logs for production).
6. **Final Shopify checklist** (compliance webhooks, domains, listing, contacts, billing test on dev store).

---

## 7. Optional (post–first approval or later)

- **Error reporting**: e.g. Sentry or similar for `console.error` and unhandled rejections.
- **Rate limiting**: You have queue/rate logic; ensure Meta and Shopify API usage stays within limits under load.
- **Performance**: If any loader remains slow, add caching or background jobs for heavy operations (e.g. building AI store context or fixing mappings).

You can use this as a linear checklist: tackle sections in the order above, or in parallel (e.g. one person on styling, one on streamlining loaders/actions).

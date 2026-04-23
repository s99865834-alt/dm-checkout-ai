# Shopify App Store Submission Guide

Complete checklist for submitting SocialRepl.ai to the Shopify App Store.

---

## 1. Demo Screencast (Required)

Shopify requires a screencast demonstrating onboarding and core features. This is the single most important asset for passing review.

### What to record

Record a screen capture (with voiceover or captions) walking through:

1. **Install and OAuth** -- Install the app from a development store, show the OAuth grant screen, and landing in the embedded app UI.
2. **Connect Instagram** -- Go through the Meta OAuth flow to connect an Instagram Business account. Show the connected state with the Instagram username and profile picture.
3. **Map products to posts** -- Open the Instagram Feed page, select a post, and map it to a Shopify product.
4. **Automation controls** -- Show toggling DM automation and comment automation on/off. Show the channel preference selector.
5. **Live DM automation** -- Send a DM to the connected Instagram account (e.g. "How much is this?"). Show the automated reply appearing with a checkout link.
6. **Live comment automation** -- Comment on a mapped post (e.g. "I want to buy this"). Show the private reply DM being sent with a checkout link.
7. **Click tracking** -- Click the checkout link from the DM, show it redirecting to the Shopify checkout page.
8. **Analytics** -- Show the Analytics page with messages sent, click-through rates, and attribution data.
9. **Billing** -- Show the plan selection page and upgrading/downgrading via Shopify Billing API.
10. **Brand voice** (optional) -- Show customizing the brand voice tone and instructions.

### Recording tips

- Use English or include English subtitles.
- Keep it under 5 minutes. Show the happy path clearly.
- Crop out desktop backgrounds and browser chrome -- focus on the app.
- Record on a dev store with realistic data (real products, real Instagram posts).
- Make sure no errors or 404s appear during the recording.

### Tools

- Loom, OBS Studio, or QuickTime (macOS) all work.
- Export as MP4, 1080p minimum.

---

## 2. Test Account Setup (Required)

Shopify reviewers need working credentials to test the app end-to-end.

### Instagram test account

1. Create a dedicated Instagram Business account (e.g. `@dmcheckoutai_test`).
2. Connect it to a Facebook Page (required for Business features).
3. Post 2-3 product photos that you will map to Shopify products.
4. Make sure the account can receive DMs from non-followers (Settings > Privacy > Messages > allow message requests from everyone).
5. Do NOT set the account to private.

### Meta app access

1. In your Meta Developer Dashboard, add the Shopify reviewer as a tester on your Meta app.
2. Alternatively, provide a test user email/password that has been added as a tester.
3. Ensure the Meta app is in Live mode (not Development) so the reviewer's DMs trigger webhooks.

### Shopify dev store

1. Use a development store with at least 3-5 real-looking products.
2. Install the app on this store.
3. Complete the Instagram connection and product mapping before submitting.
4. Make sure the Billing API flow works (test subscription create/cancel).

### What to provide in the submission form

In Part G (Testing Instructions), include:

```
Test Store: https://your-test-store.myshopify.com
Instagram Test Account: @dmcheckoutai_test

To test DM automation:
1. The app is already installed and connected to Instagram.
2. Send a DM to @dmcheckoutai_test with "I want to buy this" or "How much?"
3. You should receive an automated reply with a checkout link within 5-10 seconds.

To test comment automation:
1. Comment "I want this" on any of the test account's posts.
2. You should receive a private DM with a checkout link.

To test analytics:
1. Navigate to the Analytics page in the embedded app.
2. Data from the DM/comment tests above will appear.

Note: The Instagram account is connected via Meta's official API
(instagram_manage_messages, instagram_manage_comments permissions).
```

---

## 3. Listing Copy (Shopify-Compliant)

Updated to match actual plan caps and follow Shopify's content rules: no stats, no superlatives, no unsubstantiated claims.

### App name

`SocialRepl.ai`

### Subtitle

`AI-powered Instagram DM and comment automation with checkout links`

### Short description

> Turn Instagram DMs and comments into sales. SocialRepl.ai sends AI-powered automated replies with direct checkout links so your customers can buy without leaving the conversation.

### Key features (bullet points)

- Connect your Instagram Business account and map products to posts
- AI classifies customer intent and replies with personalized checkout links
- Comment-to-DM automation sends private replies with product links
- Track messages, clicks, and revenue attributed to Instagram in one dashboard
- Customize your brand voice to match your store's personality
- Built on Meta's official API with 24-hour messaging window compliance

### Full description

Turn Instagram DMs and comments into sales with AI-powered automated responses and direct checkout links.

**How it works**

1. Connect your Instagram Business account to your Shopify store.
2. Map your products to Instagram posts so the app knows which product to link.
3. When someone DMs or comments with purchase intent, the app classifies their message with AI and sends a personalized reply with a direct checkout link.
4. Track messages sent, click-through rates, and revenue attributed to Instagram.

**Features by plan**

**Free**
- 25 automated messages per month
- DM automation with checkout links
- Basic analytics (messages sent, CTR)
- Order attribution tracking

**Growth ($29/mo)**
- 500 automated messages per month
- Comment-to-DM automation
- Multi-turn conversation support
- Brand voice customization (Friendly, Expert, Casual)

**Pro ($99/mo)**
- 50,000 automated messages per month
- Follow-up automation (abandoned checkout recovery)
- All Growth features included
- Priority support

**Built for compliance**
- Uses Meta's official Instagram API
- Respects Instagram's 24-hour messaging window
- Opt-out keyword support (STOP, UNSUBSCRIBE, etc.)
- Shopify Billing API for all charges

### Content rules reminder

- Do NOT include stats like "increase sales by X%" or "recover X% of abandoned carts"
- Do NOT use superlatives like "the best", "the first", "the only"
- Do NOT include pricing in screenshots or the app icon
- Do NOT include reviews or testimonials in the listing
- Do NOT include guarantees

### Tags

Select tags that match the app's primary functions:
- `Marketing & conversion` > `Marketing` > `Marketing - Other`
- `Marketing & conversion` > `Marketing` > `Social media marketing`

---

## 4. Scope Justification

If Shopify asks why you need each scope, here is the justification:

| Scope | Justification |
|-------|---------------|
| `read_products` | Required to fetch product titles, descriptions, prices, variants, and handles for AI-generated replies and checkout link generation. The AI needs real product data to answer customer questions accurately. |
| `write_products` | Used to store product-to-Instagram-post mappings via metafields. When a merchant maps a product to an Instagram post, the mapping is persisted. |
| `read_orders` | Required for order attribution. When a customer completes checkout via a DM checkout link, the app matches the order's `landing_site` URL parameter to the link ID to attribute the sale to Instagram. |
| `read_legal_policies` | The AI uses the store's refund policy, shipping policy, and terms of service to answer customer questions like "What's your return policy?" accurately instead of fabricating responses. |
| `read_content` | The AI uses the store's pages (FAQ, About Us, etc.) to answer general store questions from customers in DMs. This prevents hallucinated responses. |

---

## 5. Pre-Submission Checklist

### Technical

- [ ] All test/debug routes return 404 in production (gated by NODE_ENV)
- [ ] console.log statements use logger that no-ops in production
- [ ] Shopify Billing API works (subscribe, upgrade, downgrade)
- [ ] OAuth flow completes without errors
- [ ] Compliance webhooks registered (app/uninstalled, app/scopes_update)
- [ ] Meta data deletion callback works (/meta/data-deletion)
- [ ] App functions without third-party cookies (session tokens only)
- [ ] No REST API usage (GraphQL only)
- [ ] TLS/SSL certificate valid on all endpoints

### Listing

- [ ] App name matches between Dev Dashboard and submission form
- [ ] App icon uploaded (1200x1200px)
- [ ] 5-8 screenshots with captions
- [ ] No pricing in screenshots or icon
- [ ] No stats, claims, or superlatives in listing copy
- [ ] Accurate tags selected
- [ ] Privacy policy URL provided (routes to /privacy)
- [ ] Geographic requirements noted if applicable

### Review materials

- [ ] Demo screencast recorded and uploaded (under 5 minutes, English)
- [ ] Test credentials provided (Instagram account, dev store)
- [ ] Testing instructions written (step-by-step for DM and comment flows)
- [ ] Emergency developer contact added in Partner Dashboard

### Privacy

- [ ] Privacy policy discloses Instagram data collection (usernames, messages)
- [ ] Privacy policy discloses IP address collection (click tracking)
- [ ] Privacy policy discloses OpenAI usage for message classification
- [ ] Privacy policy discloses Supabase as data storage provider
- [ ] Data access section of listing accurately reflects collected data

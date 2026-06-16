# App Store Listing & ASO (App Store Optimization)

Use this copy and checklist when submitting or updating the SocialRepl.ai listing on the Shopify App Store. Optimize before spending on paid promotion so every click converts.

---

## 1. Title & subtitle

**App name (title):** Keep short; include one high-intent keyword.

- **Option A:** `SocialRepl.ai` (brand + category)
- **Option B:** `SocialRepl.ai – Instagram to Sales` (add outcome)

**Subtitle (if supported):** One line with keywords for search and ad relevance.

- **Suggested:** `Turn Instagram DMs & comments into Shopify orders — with revenue proof`

**Keywords to naturally include in title/subtitle:** Instagram DM, Instagram checkout, DM to sale, Instagram automation, Instagram to Shopify.

> **Positioning note (use everywhere):** Lead with the one thing competitors structurally can't say — *"The Shopify-native AI that turns Instagram conversations into Shopify orders, and shows you the revenue it drove."* The four supporting pillars: (1) it already speaks your catalog, (2) closed-loop revenue attribution, (3) no flows to build, (4) focused purely on selling. Per Shopify App Store policy, do **not** name or disparage competitors (ManyChat, etc.) in the listing copy — make the case positively with phrases like "unlike generic chat-marketing tools." Competitor comparisons belong on our own site/blog (e.g. the SocialRepl.ai vs ManyChat post), not the listing.

---

## 2. Short description (lead with outcome)

Use for the main visible description; lead with the outcome, then features.

**Lead (first 1–2 sentences):**

> Turn Instagram DMs and comments into Shopify orders — and see the revenue each one drove. Built natively on Shopify, SocialRepl.ai already knows your catalog, replies with one-click checkout links, and attributes every sale. No flows to build.

**Bullets (outcome-focused):**

- Shopify-native: the AI answers from your live catalog, pricing, and policies — nothing to teach it
- Closed-loop attribution: see exactly how much Shopify revenue your Instagram conversations drove
- AI replies to DMs and comments with one-click checkout links — no flow builder to set up
- Comment-to-DM: turn public comments into private DMs with the right product link
- Free tier with DM automation each month — no credit card required (see pricing for limits)

### 2.1 Free trials (currently disabled)

The app uses **Shopify Managed Pricing**. Trials are configured per plan in
the Partner Dashboard (Apps → dm-checkout-ai → Distribution → Pricing →
edit each plan → Trial period in days). They are **not currently enabled**
on Growth or Pro.

While trials are disabled:

- **Do not mention "free trial" in the App Store listing copy.** Reviewers
  reject listings that promise a trial the app does not deliver.
- The **FREE plan** is the entry point — emphasise the free tier in the
  listing instead of a trial.
- The in-app beta-code redemption flow (`/app/pro-trial`) has been retired.
  The route now redirects to the unified billing page.

To enable trials later (after app approval):

1. Partner Dashboard → edit the Growth and/or Pro plan → set "Trial period
   in days" (e.g. 14).
2. Update the App Store listing copy to mention the trial duration, what is
   included, and what happens when the trial ends (price, cancel path).
3. No code changes required — the in-app upgrade flow already redirects to
   Shopify's hosted pricing page, which renders the trial automatically.

---

## 3. Full description (for listing page)

Expand with tier comparison and keywords. Avoid keyword stuffing; use terms naturally.

**Suggested full description:**

---

Turn Instagram DMs and comments into Shopify orders — and see the revenue each conversation drove.

SocialRepl.ai is a Shopify-native AI sales agent. Unlike generic chat-marketing tools you have to teach about your store and program with a visual flow builder, SocialRepl.ai already understands your commerce. It reads each incoming DM or comment, answers in your brand voice using your live catalog, drops in a one-click checkout link, and attributes the resulting order back to the conversation that started it. Set up in minutes — there are no flows to build.

**How it works**

1. Connect your Instagram Business account to your Shopify store.
2. Map your products to Instagram posts so the app knows which product to link.
3. When someone DMs or comments (e.g. “How much is this?”), the app sends a personalized reply with a direct checkout link.
4. Track messages sent, click-through rates, and revenue attributed to Instagram.

**Features by plan**

**Free**
- 100 automated messages per month
- DM automation with AI and checkout links
- Basic analytics (messages sent, CTR, top trigger phrases)
- No credit card required

**Growth ($39/mo)**
- 500 automated messages per month
- Comment-to-DM automation
- Brand voice customization (Casual, Professional, Friendly, and custom)
- Order attribution + full analytics

**Pro ($99/mo)**
- 10,000 automated messages per month
- Everything in Growth, plus follow-up messages
- Multi-turn conversations and per-post analytics
- Priority support

> Keep these numbers in sync with the live pricing in `app/routes/_index/route.jsx` (JSON-LD + pricing cards). For trial wording, see §2.1.

**Why SocialRepl.ai (vs. generic chat-marketing tools)**

- **It already speaks your catalog.** As a Shopify-native app, the AI answers from your real products, pricing, variants, and policies, and generates live checkout links — no flows to configure, and it stays current as your catalog changes. Generalist tools make you build all of this.
- **Proof, not just engagement.** Every link is tracked to the order, so you can see "$X in Shopify orders came from Instagram this month." We're built around attributed revenue, not leads, clicks, or broadcasts.
- **No flows to build.** The AI handles multi-turn questions you never scripted. Set up in minutes, not days — there's no keyword decision-tree to design and maintain.
- **Focused on closing the sale.** One job, done well: turning Instagram product interest into Shopify checkout. No bloated UI for channels and campaigns you'll never use.
- Built for Shopify, respects Instagram's 24-hour messaging window and Meta's policies, and requires no coding — connect, map, and go.

---

## 4. Screenshot captions (5–8 images, in order)

Create 5–8 screenshots that tell the story in this order. Add short captions on each image.

| Order | What to show | Suggested caption |
|-------|----------------|-------------------|
| 1 | Home/dashboard with “Connect Instagram” or connected account | Connect your Instagram Business account in one click |
| 2 | Instagram Feed with product mapping UI | Map products to your Instagram posts |
| 3 | Example: “Map Product” modal or list of mappings | Link each post to the right product for instant checkout |
| 4 | Automation controls (DM on/off, comment on/off) | Turn on DM and comment automation |
| 5 | Example automated reply with checkout link (in app or mock) | One-click checkout links in every reply |
| 6 | Analytics: messages sent, CTR, top phrases | See messages sent, clicks, and top trigger phrases |
| 7 | (Optional) Revenue or attribution view | Track revenue from Instagram DMs |
| 8 | (Optional) Brand voice or settings | Set your brand voice—Friendly, Expert, or Casual |

**Tip:** The first 2–3 screenshots drive most decisions. Make sure image 1 clearly shows “Instagram” and “connect” or “connected”; image 2–3 show the mapping and the value (checkout link).

---

## 5. Icon specs

- **Size:** 1200×1200 px (Shopify requirement).
- **Style:** Recognizable at small size (e.g. in search results and category grids). Use simple shapes and clear contrast.
- **Consistency:** Match any external creatives (ads, landing page) so the brand is consistent.

---

## 6. Pricing clarity (in listing and screenshots)

- **Free tier:** Prominent—“Start free: 100 automated messages per month, no credit card.”
- **Growth:** $39/month — 500 messages, comment-to-DM, brand voice, order attribution + full analytics.
- **Pro:** $99/month — 10,000 messages, follow-up messages, multi-turn conversations, per-post analytics, priority support.

Ensure the pricing section in the App Store and any in-app billing screens clearly differentiate what each tier includes so merchants know before installing.

---

## 7. Interactive demo (if available)

- **Goal:** Show connect, map product, see automated reply with link.
- **Length:** Under 5 minutes with clear callouts.
- See SHOPIFY-APP-STORE-SUBMISSION-GUIDE.md for detailed screencast requirements.

---

## 8. Pre-launch checklist

- [ ] Title and subtitle include at least one high-intent keyword (e.g. Instagram DM, Instagram checkout).
- [ ] Short description leads with outcome and mentions free tier.
- [ ] Full description includes all three tiers and main features.
- [ ] **Trial:** Trials are currently disabled. Listing text must NOT promise a free trial. (When enabled later, listing text must match Partner Dashboard trial settings — duration, what's included, post-trial price, cancel path.)
- [ ] **Day-0 in-app:** Home shows a short setup path (connect → map → test). The FREE plan is the entry point; no trial redemption flow.
- [ ] 5–8 screenshots in order: connect → map → automation → reply with link → analytics (and optional attribution/brand voice).
- [ ] Captions on every screenshot.
- [ ] Icon 1200×1200 and readable at small size.
- [ ] Pricing clearly shown (Free / Growth / Pro with differentiators).
- [ ] Optional: One short demo video or interactive demo under 3 minutes (see recording checklist in [CONTENT-SEO-PLAN.md](CONTENT-SEO-PLAN.md)).

### 8.1 Screenshot & video production (manual)

Screenshots and the demo recording are **not generated in-repo**: capture them from a **clean dev or staging store** with realistic data. Use the table in **§4 Screenshot captions** as a shot list; export at the resolution Shopify requires. For the video, follow the **Recording checklist** in [CONTENT-SEO-PLAN.md](CONTENT-SEO-PLAN.md), then upload to the listing and (optionally) YouTube and embed on your marketing site.

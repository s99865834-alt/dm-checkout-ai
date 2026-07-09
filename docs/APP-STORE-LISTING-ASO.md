# App Store Listing & ASO (App Store Optimization)

Use this copy and checklist when submitting or updating the SocialRepl.ai listing on the Shopify App Store. Optimize before spending on paid promotion so every click converts.

---

## 0. PASTE-READY listing fields: current → new (Jul 2026)

Field-by-field mapping so you can match the exact text in the Partner Dashboard
(**Apps → SocialReplAI → Distribution → Manage listing**) to its replacement.
"Currently live" text was pulled from apps.shopify.com/socialreplai on Jul 7, 2026.

Character limits verified against Shopify's current submission form: introduction 100,
details 500, features 80 each (form allows 5), subtitle ~62. Counts shown per field.
Compliance notes baked in: no competitor names, no stats/data claims, no
"the first/best/only" phrasing (App Store requirement 4.3), pricing only in the
pricing section.

### App name — NO CHANGE

Keep `SocialReplAI`.

### App card subtitle

**Currently live:**

> AI Instagram replies with checkout links for your store

**Replace with** (57 chars):

> Turn Instagram DMs & comments into orders with AI replies

### App introduction (the bold headline at the top of the listing)

**Currently live:**

> Automate Instagram DM and comment replies with AI-powered checkout links. Sell more while you sleep.

**Replace with** (98 chars):

> AI answers your Instagram DMs and comments with checkout links, turning conversations into orders.

### App details (the paragraph under the introduction)

**Currently live:**

> SocialRepl.ai connects your Shopify store to Instagram so customer conversations become sales. When someone DMs you about a product or comments on a post, the app replies instantly with a personalized AI message and a direct checkout link. The AI learns your products, pricing, and store policies to answer questions accurately in your brand's voice. It handles follow-up questions, identifies which product a customer is asking about, and tracks which conversations lead to orders.

**Replace with** (487 chars):

> Shoppers who DM you about a product are ready to buy — if they get an answer fast. SocialReplAI connects Instagram to your Shopify store and replies to DMs and comments in your brand voice, using your live catalog, pricing, and policies. Replies include a checkout link with the right product pre-loaded, and each order is attributed back to the conversation that drove it, so you see the revenue Instagram brings you. No flows to build — connect your account, set your tone, and go.

### Feature list (5 bullets — replace all 5)

**Currently live:**

1. AI-Powered Instagram DM Automation with One-Click Checkout Links
2. Automatically Reply to Post Comments with Private DMs and Product Links
3. AI Brand Voice That Knows Your Products, Policies, and FAQs
4. Order Attribution — Track Which Instagram Conversations Drive Sales
5. Multi-Turn AI Conversations That Guide Customers to Checkout

**Replace with** (80-char max each; ordered by differentiation):

1. `AI replies to DMs and comments in your brand voice — no flows to build` (72)
2. `Checkout links with the right product and variant pre-loaded in every reply` (75)
3. `Order attribution shows the revenue each DM or comment drove` (60)
4. `Answers product questions from your live catalog, pricing, and policies` (71)
5. `Comment-to-DM: turns public comments into private conversations that convert` (76)

Cut for space (work these into screenshots/captions or the details paragraph if
room ever allows): follow-up messages for unfinished checkouts, multi-language
replies, and the analytics dashboard (bullet 3 already carries the revenue story).

### Pricing, languages — NO CHANGE

Pricing (Free / $39 Growth / $99 Pro + 30-day trial) already matches the live app.

### Categories — CHANGE via appeal (currently "Marketing – Other")

Per Shopify's taxonomy (shopify.dev/docs/apps/launch/app-store-review/app-listing-categories),
there is no social-media tag under Marketing; the accurate tags are:

- **Primary: Chat** (Store management → Support → Chat) — tag definition
  "apps that allow customers to connect with merchants via chat" matches the
  app's main function (AI answering customer DMs/comments). Closest comparable
  app (Dondy, WhatsApp commerce automation) is categorized Chat + Abandoned cart.
- **Secondary: Abandoned cart** (Marketing → Abandoned cart) — justified by
  Pro follow-up messages that re-engage shoppers who didn't finish checkout.
- Category changes post-launch require an appeal via the link in the app
  submission form. Appeal text:

  > **Requested change:** Primary tag from "Marketing – Other" to "Chat"
  > (Store management → Support), with "Abandoned cart" as secondary.
  >
  > **Reason:** SocialReplAI's main function is conversational: it connects a
  > merchant's Instagram Business account to their Shopify store, and AI
  > replies to customer DMs and comments in real time — answering product,
  > pricing, and policy questions and including checkout links. This matches
  > the Chat tag definition ("apps that allow customers to connect with
  > merchants via chat") more accurately than Marketing – Other. Comparable
  > apps in this space (e.g., WhatsApp commerce-chat automation apps) are
  > categorized under Chat.
  >
  > The secondary Abandoned cart tag reflects the app's follow-up messaging
  > feature, which re-engages customers who received a checkout link but
  > didn't complete their purchase.

- **Structured features:** check every applicable feature (up to 25 per
  category) — powers merchant comparison filters; editable anytime without appeal.

### Search terms (hidden field, 5 max, 20 chars each — one idea per term)

Replaced Jul 7, 2026 (previous: instagram / sell on instagram / instagram dm /
instagram comments / instagram marketing — mostly redundant with name/subtitle,
and "instagram marketing" pulled wrong-intent searchers):

1. `instagram automation` (20 — "automation" appears nowhere in name/subtitle)
2. `instagram auto reply` (20 — problem phrasing merchants type)
3. `ai chatbot` (10 — high-volume head term; aligns with Chat category appeal)
4. `comment to dm` (13 — named behavior, low competition; alt: `comment automation`)
5. `sell on instagram` (17 — commerce intent, kept from previous set)

Rationale: title/subtitle already rank for "Instagram / DMs / comments / AI
replies / orders" (name + subtitle are weighted heaviest), so search terms cover
adjacent phrasings instead of repeating them. Revisit after 2–4 weeks of GA4
listing data (Traffic acquisition filtered to hostname apps.shopify.com).

### Tracking information (same listing form) — verify, likely empty

Not visible from the public listing — check the field while you're in the editor.
If empty, add GA4 measurement ID `G-BDGNW3KHQD` plus a Measurement Protocol API
secret (see §9 below for both parts).

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
- [ ] **Trial:** The Pro plan's 30-day free trial is live (Partner Dashboard → Managed Pricing). Listing text must match the trial settings exactly — duration, what's included, post-trial price, cancel path. Do not mention trials on plans that don't have one configured.
- [ ] **Day-0 in-app:** Home shows a short setup path (connect → map → test). The FREE plan is the entry point; no trial redemption flow.
- [ ] 5–8 screenshots in order: connect → map → automation → reply with link → analytics (and optional attribution/brand voice).
- [ ] Captions on every screenshot.
- [ ] Icon 1200×1200 and readable at small size.
- [ ] Pricing clearly shown (Free / Growth / Pro with differentiators).
- [ ] Optional: One short demo video or interactive demo under 3 minutes (see recording checklist in [CONTENT-SEO-PLAN.md](CONTENT-SEO-PLAN.md)).

### 8.1 Screenshot & video production (manual)

Screenshots and the demo recording are **not generated in-repo**: capture them from a **clean dev or staging store** with realistic data. Use the table in **§4 Screenshot captions** as a shot list; export at the resolution Shopify requires. For the video, follow the **Recording checklist** in [CONTENT-SEO-PLAN.md](CONTENT-SEO-PLAN.md), then upload to the listing and (optionally) YouTube and embed on your marketing site.

---

## 9. Google Analytics on the App Store listing

The marketing site already runs GA4 property `G-BDGNW3KHQD`
(`app/routes/_index/route.jsx`). Reusing the same property for the listing keeps
site + listing traffic in one place. Two parts:

**Part A — measurement ID (listing page-view tracking):**

1. Partner Dashboard → **Apps** → SocialReplAI → **Distribution** → **Manage listing** → open the listing.
2. In **Tracking information** → *Google analytics code*, enter `G-BDGNW3KHQD`.
3. Save.

Optional but cleaner: in GA Admin → Data Streams, add a separate web stream for
`https://apps.shopify.com/socialreplai` and use that stream's `G-…` ID instead,
so listing traffic is separable from site traffic.

**Part B — Measurement Protocol API secret (server-side install events):**

Without this, you see listing page views but not install events tied to source.

1. GA → **Admin** → **Data Streams** → select the stream matching the measurement ID used in Part A.
2. **Measurement Protocol API secrets** → **Create** → copy the secret.
3. Back in the Partner Dashboard listing's **Tracking information**, paste the secret into the API secret field.
4. Save. Shopify then sends the app-install event server-side; verify in GA Realtime by watching for the "Add app button" / install event after a test visit.

**What to watch weekly (GA + Partner Dashboard):** listing page views → installs
(conversion rate), and which referral sources/keywords drive installs. Log them in
[METRICS-TRACKING.md](METRICS-TRACKING.md)'s weekly template.

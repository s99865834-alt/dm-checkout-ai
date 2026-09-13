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

> AI answers your Instagram DMs and comments with checkout links, turning conversations into orders.

**Replace with** (85 chars):

> AI answers your Instagram DMs with checkout links, turning conversations into orders.

### App details (the paragraph under the introduction)

**Currently live:**

> Shoppers who DM you about a product are ready to buy, if they get an answer fast. SocialReplAI connects Instagram to your Shopify store and replies to DMs, comments, and story replies in your brand voice, using your live catalog, pricing, and policies. Replies include a checkout link with the right product pre-loaded, and each order is attributed back to the conversation that drove it, so you see the revenue Instagram brings you. No flows to build: connect your account, set your tone, and go.

**Replace with** (456 chars):

> Shoppers who DM you about a product are ready to buy, if they get an answer fast. SocialReplAI connects Instagram to your Shopify store and replies using your live catalog, pricing, and policies. Replies include a checkout link with the right product pre-loaded, and each order is attributed back to the conversation that drove it. Comment-to-DM turns public comments into private conversations that convert. No flows to build: connect your account and go.

### Feature list (5 bullets — replace all 5)

**Currently live:**

1. AI-Powered Instagram DM Automation with One-Click Checkout Links
2. Automatically Reply to Post Comments with Private DMs and Product Links
3. AI Brand Voice That Knows Your Products, Policies, and FAQs
4. Order Attribution — Track Which Instagram Conversations Drive Sales
5. Multi-Turn AI Conversations That Guide Customers to Checkout

**Replace with** (80-char max each; ordered by differentiation):

1. `AI replies to Instagram DMs with checkout links, no flows to build` (66)
2. `Checkout links with the right product and variant pre-loaded` (60)
3. `Order attribution shows the revenue each conversation drove` (59)
4. `Answers product questions from your live catalog, pricing, and policies` (71)
5. `Comment-to-DM: turns public comments into private conversations that convert` (76)

Cut for space (work these into screenshots/captions or the details paragraph if
room ever allows): follow-up messages for unfinished checkouts, multi-language
replies, and the analytics dashboard (bullet 3 already carries the revenue story).

### Pricing — CHANGE (Free becomes a demo, Sep 13 2026)

Prices are unchanged (Free / $39 Growth / $99 Pro). What each plan includes
changed. Paste these into Partner Dashboard → Apps → SocialReplAI →
Distribution → Pricing, then into the listing Pricing details.

Do this **before** merging to `main`. The site and in-app billing now promise
a 7-day Growth trial. If Managed Pricing does not have that trial set, the
listing can be rejected under requirement 4.2.1.

**Free**
- 25 messages/month
- DM automation with AI
- Checkout links
- Basic analytics
- Comment-to-DM, multi-turn, and brand voice for first 14 days after connecting Instagram
- 500 messages during those 14 days

**Growth ($39/month)**
- 7-day free trial
- Comment-to-DM, always on
- Multi-turn conversations
- Brand voice customization
- Order attribution + full analytics
- 1,000 messages/month

**Pro ($99/month)**
- 30-day free trial
- Everything in Growth
- Instagram Stories automation
- Default product for stories and unmapped posts
- Follow-up messages
- Per-post analytics
- Priority support
- 10,000 messages/month

Two compliance notes:

- **The 14-day comment window is pricing information** (requirement 4.2). It
  belongs in Pricing details only. Do not put "free for 14 days" in the
  introduction, details, features, or screenshots.
- **Do not claim story mentions.** Story replies are answered on Pro.
  Mentions have never been observed.

Message caps are enforced in our own database, not by Shopify Managed Pricing,
so dropping Free to 25 needs no billing-API change. The plan description in
the Partner Dashboard still has to match, or the listing will be wrong.

### Pricing (historical, Aug 31 2026)

Previous row for context. Superseded by the Sep 13 table above.

| | was | Aug 31 |
|---|---|---|
| Free monthly messages | 100 | 100 (500 during the comment window) |
| Free comment-to-DM | not included | included for 14 days from Instagram connect |
| Growth monthly messages | 500 | 1,000 |
| Growth multi-turn | listed under Pro | Growth |
| Pro | 10,000 messages, follow-ups | adds story replies; volume de-emphasised |

### Languages — NO CHANGE

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

### 2.1 Free trials — set these in Partner Dashboard before merging

The app uses **Shopify Managed Pricing**. Trials are configured per plan in
the Partner Dashboard (Apps → SocialReplAI → Distribution → Pricing → edit
each plan → Trial period in days).

Required to match the site and in-app billing copy:

- **Growth:** 7-day trial
- **Pro:** 30-day free trial (already advertised)

The Free plan's 14-day comment window is **not** a Shopify trial. It is
in-app functionality keyed to `shops.comment_trial_started_at`, needs no
Managed Pricing configuration, and involves no charge approval. Describe it
in Pricing details as part of what the Free plan includes, never as a
"free trial", so it is not confused with the Growth or Pro trials.

`getTrialStatus()` in `billing.server.js` reads `trialDays` off the live
subscription, so the in-app banner is already driven by the real value. Only
the static marketing copy can drift. If a trial is not configured, remove it
from the listing, the site, and `app.billing.select.jsx` before merge.

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
- 25 automated messages per month
- DM automation with AI and checkout links
- Comment-to-DM, multi-turn, and brand voice for your first 14 days after connecting Instagram,
  with your allowance raised to 500 messages during that period
- Basic analytics (messages sent, CTR, top trigger phrases)
- No credit card required

**Growth ($39/mo)**
- 7-day free trial
- Comment-to-DM automation, always on
- Brand voice customization (Casual, Professional, Friendly, and custom)
- Multi-turn conversations
- Order attribution + full analytics
- 1,000 automated messages per month

**Pro ($99/mo)**
- 30-day free trial
- Everything in Growth, plus story replies: the AI answers people who reply to
  your Instagram story with a product link
- Follow-up messages for shoppers who got a link but didn't check out
- Per-post analytics
- 10,000 automated messages per month
- Priority support

> Order matters in the Pro list: lead with story replies and follow-ups, not the
> cap. No live store comes close to 10,000 a month, so a merchant reading
> "10,000 messages" first correctly concludes Pro is not for them. Pro has to be
> bought for what it does, not for headroom.

> Keep these numbers in sync with the live pricing in `app/routes/_index/route.jsx` (JSON-LD + pricing cards), `app/lib/plans.js` (the enforced caps), and `app/routes/app.billing.select.jsx` (the in-app comparison table). For trial wording, see §2.1.

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

**Re-shoot check after the Aug 31 tier change.** Any screenshot showing the
in-app billing comparison table, a plan card, or a usage bar reading "/500" is
now wrong. Screenshots must not contain pricing at all (requirement 4.2.2), so
the fix is to reframe the shot rather than update the number: crop usage bars
out, and drop billing-page screenshots entirely. Home-page captures taken during
a Free store's comment window will show the countdown banner, which does contain
plan terms — capture those on a Growth store instead.

**Tip:** The first 2–3 screenshots drive most decisions. Make sure image 1 clearly shows “Instagram” and “connect” or “connected”; image 2–3 show the mapping and the value (checkout link).

---

## 5. Icon specs

- **Size:** 1200×1200 px (Shopify requirement).
- **Style:** Recognizable at small size (e.g. in search results and category grids). Use simple shapes and clear contrast.
- **Consistency:** Match any external creatives (ads, landing page) so the brand is consistent.

---

## 6. Pricing clarity (in listing and screenshots)

- **Free tier:** Prominent: "Start free: 14-day Growth demo, then 25 DMs/month. No credit card."
- **Growth:** $39/month — 1,000 messages, comment-to-DM always on, brand voice, multi-turn conversations, order attribution + full analytics.
- **Pro:** $99/month — story replies, follow-up messages, per-post analytics, 10,000 messages, priority support.

Ensure the pricing section in the App Store and any in-app billing screens clearly differentiate what each tier includes so merchants know before installing.

**Anchor-defusing line (added to the website pricing cards, Aug 2026):** merchants who
comparison-shop notice Growth/Pro land on the same numbers as well-known chat-marketing
tools. The website pricing cards (`app/routes/_index/route.jsx`) now name ManyChat
directly under each price — that's fine on our own site, where we already run the
head-to-head blog post and comparison table. **Do not port that exact wording into the
Shopify App Store listing** — competitor names are not allowed there (§1 note above). If
you want the same reframe in the listing's pricing copy, use a generic version instead,
e.g.: *"Priced like other chat-marketing tools — built like a Shopify app: no flows to
configure, it already knows your catalog."*

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
- [ ] **Trial:** Growth's 7-day trial and Pro's 30-day trial are live (Partner Dashboard → Managed Pricing). Listing text must match the trial settings exactly: duration, what's included, post-trial price, cancel path. Do not mention a trial on a plan that does not have one configured.
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

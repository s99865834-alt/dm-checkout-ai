# App Store Listing & ASO (App Store Optimization)

Use this copy and checklist when submitting or updating the SocialRepl.ai listing on the Shopify App Store. Optimize before spending on paid promotion so every click converts.

---

## 0. PASTE-READY listing fields: current → new (Sep 2026)

Field-by-field mapping for Partner Dashboard
(**Apps → SocialReplAI → Distribution → Manage listing**).
Live text pulled from apps.shopify.com/socialreplai on Sep 7, 2026.

Do not reopen the Jul 2026 Chat + Abandoned cart appeal. That change is live
and it is the wrong aisle: "More apps like this" is WhatsApp cart recovery.
Shopify's own category guidance is to match similar apps. FlashDM and
Claimbase sit in Selling online - Other.

Character limits: introduction 100, details 500, features 80 each (5 max),
subtitle ~62, search terms 20 each (5 max). No competitor names, no stats
claims, no "the first/best/only" (requirement 4.3). Pricing only in Pricing.

**Verdict (do not reverse this without new evidence):**

- **Copy:** subtitle, intro, and feature bullets stay. Details currently
  claim story replies, which are Pro-only. Replace the details paragraph.
- **Category:** appeal primary to Selling online - Other. Drop Abandoned cart
  (Pro follow-ups are not the main function). Drop hidden term `ai chatbot`.
- **Price numbers:** keep Free / $39 Growth / $99 Pro. Do not cut Growth to
  match FlashDM's $10. Reorder Growth bullets so they sell comments, brand
  voice, and attribution, not "1,000 messages."

### App name — NO CHANGE

Keep `SocialReplAI`.

### App card subtitle — NO CHANGE

Live (57 chars), keep:

> Turn Instagram DMs & comments into orders with AI replies

### App introduction — NO CHANGE

Live (98 chars), keep:

> AI answers your Instagram DMs and comments with checkout links, turning conversations into orders.

### App details — CHANGE

**Currently live** (claims story replies, which are Pro-only):

> Shoppers who DM you about a product are ready to buy, if they get an answer fast. SocialReplAI connects Instagram to your Shopify store and replies to DMs, comments, and story replies in your brand voice, using your live catalog, pricing, and policies. Replies include a checkout link with the right product pre-loaded, and each order is attributed back to the conversation that drove it, so you see the revenue Instagram brings you. No flows to build: connect your account, set your tone, and go.

**Replace with** (388 chars):

> Shoppers already asking "still available?" or DMing a size are ready to buy. SocialReplAI replies to Instagram DMs and comments in your brand voice, using your live catalog, pricing, and policies. Every reply can include a checkout link with the right product loaded, and each order is attributed to the conversation that drove it. Connect Instagram, map posts to products, set your tone.

Do not put story replies in details, intro, or feature bullets. Stories are
Pro. Do not claim story mentions until one is observed in production.

### Feature list — KEEP (one em dash cleanup)

Live bullets are the right five. Only change bullet 1 to drop the em dash
(product copy rule). 80-char max.

1. `AI replies to DMs and comments in your brand voice, no flows to build` (69)
2. `Checkout links with the right product and variant pre-loaded in every reply` (75)
3. `Order attribution shows the revenue each DM or comment drove` (60)
4. `Answers product questions from your live catalog, pricing, and policies` (71)
5. `Comment-to-DM: turns public comments into private conversations that convert` (76)

### Pricing — KEEP THE NUMBERS, REORDER GROWTH BULLETS

Do not change Free / $39 / $99. Growth is priced against chat-marketing tools
that do not already know the Shopify catalog, not against FlashDM's $10 / 1,000
queries. The listing currently leads Growth with "1,000 messages/month," which
invites that $10 comparison. Nobody live is near 1,000 sends (busiest store is
about 95/month). $39 is buying comment-to-DM, brand voice, and attribution.

Partner Dashboard → Apps → SocialReplAI → Distribution → Pricing.

**Free** (already honest, keep):

- 100 messages/month
- DM automation with AI
- Checkout links
- Basic analytics
- Comment-to-DM free for first 14 days
- 500 messages during those 14 days

**Growth $39** (replace feature order):

- Comment-to-DM, always on
- Brand voice customization
- Order attribution + full analytics
- Multi-turn conversations
- Store question answering
- 1,000 messages/month

**Pro $99** (keep, do not claim story mentions):

- Everything in Growth
- Instagram story replies
- Follow-up messages
- Per-post analytics
- Priority support
- 10,000 messages/month

The 14-day comment window is pricing information (requirement 4.2). It belongs
in Pricing details only. Do not put "free for 14 days" in the introduction,
details, features, or screenshots.

Do not claim story mentions. Story replies are answered on Pro. Mentions have
not been observed in production. Add that claim only after one is seen in
`messages.content_type = 'story_mention'`.

### Languages — NO CHANGE

### Categories — APPEAL AWAY FROM CHAT (live is Chat + Abandoned cart)

Live tags are Chat (Store management → Support) and Abandoned cart (Marketing).
That was the Jul 2026 appeal. It placed the listing next to WhatsApp
cart-recovery apps. Shopify's category doc says to use the tags similar apps
use. Instagram sales apps (FlashDM, Claimbase) use **Selling online - Other**.
Abandoned cart is the wrong secondary: follow-ups are Pro-only and are not the
main function. Shopify: if Y is a small extra, do not add Y as a tag.

Subsequent category changes need an appeal (link on the listing form).

**Requested change:** Primary tag from Chat to Selling online - Other
(Sales channels → Selling online). Remove Abandoned cart. No secondary tag.

**Appeal text:**

> Requested change: primary tag from Chat (Store management, Support) to
> Selling online - Other (Sales channels, Selling online). Remove the
> Abandoned cart secondary tag.
>
> Reason: SocialReplAI's main function is selling on Instagram. It connects a
> merchant's Instagram Business account to their Shopify store, replies to
> customer DMs and comments from the live catalog, and sends checkout links
> with the product loaded. That matches Selling online ("apps that let
> merchants sell across online platforms") and Selling online - Other ("other
> ways to sell online"). Comparable Instagram sales apps on the App Store use
> this tag.
>
> Chat is a poor fit. The listing currently appears next to WhatsApp
> abandoned-cart apps, which is not the merchant searching for Instagram
> comment-to-DM or Instagram checkout. Abandoned cart is also a poor fit:
> follow-up messages exist only on Pro and are not the app's main function.

**Structured features:** editable without appeal. Uncheck AI chatbots and
Cart recovery if those are still selected. They match WhatsApp inbox tools,
not this product. Check Social media / Automated responses if still offered.

### Search terms (hidden field, 5 max, 20 chars each, one idea per term)

Keep 1, 2, 4, 5. Replace `ai chatbot` (it pulls WhatsApp / generic chatbot
intent and was added to match the Chat category).

1. `instagram automation` (20)
2. `instagram auto reply` (20)
3. `instagram dm sales` (18)  ← replaces `ai chatbot`
4. `comment to dm` (13)
5. `sell on instagram` (17)

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

### 2.1 Free trials — VERIFY BEFORE SUBMITTING

> **Unresolved contradiction.** This section says trials are disabled; §8's
> checklist says Pro's 30-day trial is live. Meanwhile the marketing site
> (`_index/route.jsx`), the in-app billing page (`app.billing.select.jsx`) and
> the blog posts all advertise a 30-day Pro trial. If no trial is actually
> configured in Managed Pricing, every one of those surfaces is promising
> something the app does not deliver, which is both a rejection risk under
> requirement 4.2.1 and a chargeback risk with real merchants.
>
> Check Partner Dashboard → Apps → SocialReplAI → Distribution → Pricing → Pro
> → "Trial period in days" and make reality and copy agree in whichever
> direction is correct. `getTrialStatus()` in `billing.server.js` reads
> `trialDays` off the live subscription, so the in-app banner is already driven
> by the real value; only the static marketing copy can drift.

The app uses **Shopify Managed Pricing**. Trials are configured per plan in
the Partner Dashboard (Apps → dm-checkout-ai → Distribution → Pricing →
edit each plan → Trial period in days).

Note that the Free plan's 14-day comment window is **not** a Shopify trial. It
is in-app functionality keyed to `shops.comment_trial_started_at`, needs no
Managed Pricing configuration, and involves no charge approval. Describe it in
Pricing details as part of what the Free plan includes, never as a "free trial",
so it is not confused with the Pro trial.

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
- Comment-to-DM included free for your first 14 days after connecting Instagram,
  with your allowance raised to 500 messages during that period
- Basic analytics (messages sent, CTR, top trigger phrases)
- No credit card required

**Growth ($39/mo)**
- 1,000 automated messages per month
- Comment-to-DM automation, always on
- Brand voice customization (Casual, Professional, Friendly, and custom)
- Multi-turn conversations
- Order attribution + full analytics

**Pro ($99/mo)**
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

- **Free tier:** 100 automated DMs per month, no credit card. Comment-to-DM for the first 14 days after Instagram connect (Pricing section only).
- **Growth $39:** lead with comment-to-DM always on, brand voice, attribution. Put 1,000 messages last.
- **Pro $99:** story replies, follow-ups, per-post analytics. Do not lead with 10,000 messages. Do not claim story mentions.

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

# Metrics & Tracking

Track these so you can optimize ad spend and scale only where it’s sustainable.

---

## 1. Core metrics

| Metric | Where to get it | Why it matters |
|--------|------------------|----------------|
| **Installs** | Shopify Partner Dashboard (Apps → your app → Analytics or Installs) | Volume of new stores installing the app. |
| **Trial → paid** | Your billing/DB: count of installs that start Growth or Pro within 7/14/30 days | Conversion quality; LTV driver. |
| **CAC (cost per install)** | Ad spend ÷ new installs (per campaign or overall) | How much you pay for one install. |
| **CAC (cost per paid merchant)** | Ad spend ÷ new paid merchants | How much you pay for one paying customer. |
| **LTV** | Revenue per merchant over 3–6 months (from billing/DB) | How much each merchant is worth; compare to CAC. |

Use **CAC vs LTV** to decide how much you can spend: e.g. if LTV is $200 and you’re okay with a 3:1 LTV:CAC ratio, you can pay up to ~$67 per paid merchant.

---

## 2. UTM parameters (external campaigns)

When you send traffic from **outside** the Shopify App Store (e.g. Facebook, Google, email, blog), use UTM parameters so you can see which channel drives installs.

**Format:**

```
[Your App Store listing URL]?utm_source=SOURCE&utm_medium=MEDIUM&utm_campaign=CAMPAIGN
```

**Examples:**

| Channel | utm_source | utm_medium | utm_campaign |
|---------|-------------|------------|--------------|
| Facebook ads | facebook | cpc | launch_2025 |
| Google Search | google | cpc | instagram_dm_keywords |
| Blog post | blog | referral | how_to_sell_instagram_dms |
| Email | email | newsletter | launch_announce |
| Product Hunt | producthunt | referral | launch |

**Note:** Shopify may not show UTM in Partner Dashboard by default. If you use a **landing page** that then links to the App Store, the landing page URL can capture UTM; use the same params on the final “Install” link so you can correlate (e.g. via landing page analytics) which campaigns led to clicks to the store.

---

## 3. What to track weekly

- **Installs:** Total and, if possible, by source (App Store ads vs organic vs external).
- **Ad spend:** By campaign (Search, Category, Homepage) and by keyword set if the dashboard allows.
- **Cost per install:** Ad spend ÷ installs from paid in that period.
- **Trial → paid rate:** % of installs (e.g. in the last 14 days) that started a paid plan.
- **Reviews:** New reviews and average rating (aim 4.5+).

---

## 4. When to increase or decrease spend

- **Increase:** When CPA (cost per install or cost per paid) is below your target and you have enough data (e.g. 20+ installs from that channel).
- **Decrease or pause:** When CPA is above target or trial→paid is very low for that channel; pause underperforming keywords or placements.
- **Reallocate:** Move budget from worst-performing to best-performing (e.g. from Homepage to Search if Search converts better).

---

## 5. Simple dashboard (if you build one)

If you add a simple internal dashboard, include:

- Installs (last 7 / 30 days).
- Paid plan starts (last 7 / 30 days).
- Trial→paid % by cohort (install week).
- Ad spend by campaign (or by week).
- Cost per install and cost per paid (by campaign or overall).

Data can come from: Shopify Partner API (installs), your billing/DB (plan starts, revenue), and ad platform exports (spend). A spreadsheet updated weekly is enough to start.

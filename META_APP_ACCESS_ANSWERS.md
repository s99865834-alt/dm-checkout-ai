# Meta App Review - App Access Questions

## 1. Where can we find the app?

**App Base URL:** `https://dm-checkout-ai-production.up.railway.app`

**Important:** This is an embedded Shopify app, so it cannot be accessed directly via URL. Reviewers must access it through Shopify Admin using the test store credentials provided separately.

**Verification:** You can verify the app is accessible by checking:
- Privacy Policy: `https://dm-checkout-ai-production.up.railway.app/privacy`
- Terms of Service: `https://dm-checkout-ai-production.up.railway.app/terms`
- Webhook endpoint: `https://dm-checkout-ai-production.up.railway.app/webhooks/meta`

---

## 2. Provide instructions for accessing the app so we may complete our review.

### How to Access the App

This is an **embedded Shopify app** that runs inside Shopify Admin. To access it:

1. **Log into Shopify Test Store Admin:**
   - Store URL: `https://dmteststore-2.myshopify.com/admin`
   - Staff account credentials: [Provided separately in review submission]

2. **Navigate to the App:**
   - In Shopify Admin, go to **Apps** → **DM Checkout AI**
   - The app will open in an embedded iframe within Shopify Admin

3. **Key Pages for Testing:**
   - **Home** (`/app`): Main dashboard with automation controls
   - **Webhook Demo** (`/app/webhook-demo`): Test Instagram webhook processing (RECOMMENDED for testing)
   - **Instagram Feed** (`/app/instagram-feed`): View Instagram posts and product mappings
   - **Analytics** (`/app/analytics`): View message analytics and performance metrics

### Testing Instructions

**Method 1: In-App Webhook Demo (Recommended)**
1. Navigate to **Webhook Demo** page (`/app/webhook-demo`)
2. Select test type:
   - **Comment → DM**: Tests comment-to-DM automation with product context
   - **Direct DM**: Tests DM automation without product context
3. Choose a scenario (Purchase Intent, Product Question, Size Inquiry, or Custom)
4. Click **"Send Test Webhook"**
5. Review the results:
   - Step 2 shows webhook processing, AI classification, and automation decision
   - Step 3 shows the message logged in the database with AI response preview

**Method 2: Real Instagram Comment Test**
1. Navigate to the Instagram post: [INSERT YOUR INSTAGRAM POST URL]
2. Leave a comment with purchase intent: "I want to buy this" or "How much does this cost?"
3. Within a few moments, you should receive a private DM from the Instagram business account
4. Verify in the app: Go to **Webhook Demo** → **Recent Messages (Database)** to see the comment logged

**Method 3: Meta Dashboard Test Webhook**
1. Meta App Dashboard → **Webhooks** → **Instagram**
2. Find **messages** or **comments** → click **Test**
3. Click **Send to my server**
4. Verify in app: **Webhook Demo** → **Recent Messages (Database)**

### Meta APIs and Facebook Login

**Facebook Login:** This app does NOT use Facebook Login. The app uses:
- **Instagram Messaging API** for sending/receiving DMs
- **Instagram Comments API** (via webhooks) for receiving comment events
- **Meta Graph API** for reading Instagram account information and media

The app authenticates users through **Shopify OAuth** (not Facebook Login). Users connect their Instagram Business account through a separate OAuth flow that grants permissions to their Facebook Page and linked Instagram Business account.

**Meta API Endpoints Used:**
- `GET /{ig-business-id}/media` - Fetch Instagram posts
- `GET /{ig-business-id}` - Get Instagram account info
- `POST /{ig-business-id}/messages` - Send Instagram DMs
- Webhook subscriptions for `messages` and `comments` events

---

## 3. If payment or membership is required to access the full functionality of this app, provide access codes or test credentials so we can access and review all features on this app.

**Payment Tiers:**
- **FREE**: 25 messages/month, DM automation only
- **GROWTH**: $29/month, 500 messages/month, Comment-to-DM automation, Brand voice
- **PRO**: $99/month, 50,000 messages/month, All features including Follow-up automation

**Test Store Access:**
The provided Shopify test store (`dmteststore-2.myshopify.com`) has been upgraded to **PRO tier** in the database, which provides access to all features including:
- Comment-to-DM automation (required for testing `instagram_business_manage_comments`)
- Follow-up automation
- Brand voice customization
- All analytics features

**No payment codes required** - The test store account has full PRO access already configured. Reviewers can test all features without any payment or subscription setup.

**Note:** The app's billing system uses Shopify's recurring charge API, but the test store bypasses this requirement for review purposes.

---

## 4. If payment is required to download this app, provide 8 - 10 gift codes so we can download it from app stores without payment.

**Not Applicable**

This app is a **web-based Shopify app**, not a mobile app store application. It does not require download or installation from app stores. The app is:
- Installed directly from the Shopify App Store (free to install)
- Accessed through Shopify Admin as an embedded web application
- No app store codes or gift codes are required

The app is free to install. Paid subscriptions (GROWTH $29/month, PRO $99/month) are optional upgrades for additional features and higher message limits, but the test store already has PRO access configured.

---

## 5. If access to this app or any of its features is limited to users within a specific geographic location or restricted by geo-blocking or geo-fencing, provide instructions for our reviewers to bypass these restrictions.

**No Geographic Restrictions**

This app has **no geo-blocking, geo-fencing, or geographic restrictions**. The app is accessible from anywhere in the world and all features work globally. 

**Requirements:**
- Users must have a Shopify store (Shopify is available globally)
- Users must have an Instagram Business account (Instagram Business is available globally)
- Users must have a Facebook Page linked to their Instagram Business account (Facebook Pages are available globally)

**No VPN or location bypassing is required** - reviewers can access and test the app from any location without restrictions.

---

## Additional Notes for Reviewers

- **Development Mode Limitation:** Since the Meta app is in Development mode, real-time webhooks may not work. Use the **Webhook Demo** page (Method 1) for reliable testing.
- **Test Store Credentials:** Provided separately in the review submission
- **Instagram Post for Testing:** [INSERT YOUR INSTAGRAM POST URL HERE]
- **Contact:** [INSERT YOUR CONTACT INFORMATION HERE]

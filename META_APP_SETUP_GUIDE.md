# Meta App Setup Guide for SocialRepl.ai

This guide provides step-by-step instructions for setting up your Meta app (Facebook/Instagram) for SocialRepl.ai, ensuring user privacy, Meta approval, and proper integration with your Shopify app.

## Table of Contents

1. [Privacy & Anonymity Requirements](#privacy--anonymity-requirements)
2. [Meta App Creation](#meta-app-creation)
3. [App Configuration for Meta Review](#app-configuration-for-meta-review)
4. [Environment Variables Setup](#environment-variables-setup)
5. [Webhook Setup](#webhook-setup)
6. [Database Schema Requirements](#database-schema-requirements)
7. [Code Integration Points](#code-integration-points)
8. [Meta Review Submission Checklist](#meta-review-submission-checklist)

---

## Privacy & Anonymity Requirements

### Critical: Keep Your Personal Identity Private

**Important:** You want to keep your personal Facebook/Instagram profile private from your app. Friends and connections should NOT be able to discover that you're the developer of SocialRepl.ai. Here's how to ensure this:

1. **Configure Privacy Settings:**
   - Meta requires you to sign in with your personal Facebook account
   - **BUT** you can configure privacy settings so your personal profile doesn't show developer status
   - Set app visibility to "Only Me" in your Facebook profile settings
   - Your developer account is separate from your personal profile visibility
   - Your friends won't see the app or your developer status on your personal profile

2. **App Name Consistency:**
   - Use **"SocialRepl.ai"** as the app name in Meta Dashboard (same as Shopify App Store)
   - This ensures consistency when merchants see the app name during OAuth
   - Merchants will see "SocialRepl.ai" when connecting Instagram, matching what they see in Shopify App Store

3. **Message Attribution:**
   - When sending DMs/comments, messages appear to come from the merchant's Instagram Business account
   - **NOT** from "SocialRepl.ai" or your personal account
   - Messages look like they're coming directly from the business
   - End users (customers) never see your name or the app name in messages

4. **App Privacy Settings:**
   - In Meta App Dashboard → Settings → Basic → Privacy Policy URL
   - Use your Shopify app's privacy policy URL (same across platforms)
   - This ensures consistency and easier maintenance

5. **Developer Profile Privacy:**
   - Your personal Facebook/Instagram profile will NOT show that you're a developer (if privacy settings are configured)
   - The app is associated with your developer account, which is separate from your personal profile visibility
   - Friends/connections cannot discover the app through your personal profile (if privacy settings are configured)

### Best Practices for Privacy

- **App Name in Meta Dashboard:** "SocialRepl.ai" (matches Shopify App Store for consistency)
- **Developer Account:** Sign in with personal Facebook account (required by Meta), but configure privacy settings to hide developer status
- **App Description:** Professional description focusing on customer service automation
- **User-Facing Messages:** Always appear to come from the merchant's account, never mention the app or your name
- **Webhook Callbacks:** Use your Shopify app domain, not a Meta-specific domain

---

## Meta App Creation

### Step 1: Create Meta Developer Account

**Important Privacy Note:** Meta requires you to sign in with your personal Facebook account, but you can configure privacy settings so your personal profile doesn't show you're a developer.

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click "Get Started" or "My Apps"
3. Sign in with your **personal Facebook account** (this is required by Meta)
4. Complete verification if required
5. **After creating your app, configure privacy settings** (see Step 1.5 below)

### Step 1.5: Configure Privacy Settings to Hide Developer Status

After creating your developer account, configure privacy to keep your personal profile private:

1. Go to your **personal Facebook profile** → Settings & Privacy → Settings
2. Navigate to **Apps and Websites** (or **Apps** in older interface)
3. Find your Meta Developer app/account
4. **Set visibility to "Only Me"** or remove it from your profile entirely
5. Go to **Privacy Settings** → **Who can see your friends list** → Set to "Only Me" (optional, for extra privacy)
6. **Developer Dashboard Privacy:**
   - In Meta for Developers dashboard, go to Settings → Basic
   - Your developer profile is NOT publicly visible by default
   - Apps you create are associated with your developer account, not your personal profile

**Result:** Your personal Facebook/Instagram friends will NOT see that you're a developer or that you created this app. The app is linked to your developer account, which is separate from your personal profile visibility.

### Step 2: Create New App

1. Click "Create App" in Meta for Developers dashboard
2. Select **"Business"** as the app type (NOT "Consumer" or "None")
3. Fill in the app details:
   - **App Name:** `SocialRepl.ai` (matches your Shopify App Store name for consistency)
   - **App Contact Email:** Your business email (recommended, but can use personal email)
   - **Purpose:** Select "Help your business connect with customers"
4. Click "Create App"
5. **Privacy Note:** Using "SocialRepl.ai" ensures merchants see the same app name in Meta OAuth as they see in Shopify App Store, maintaining brand consistency
6. **After creating the app, configure privacy settings** (see Step 1.5 above) to hide developer status from your personal profile

### Step 3: Configure Instagram API Use Case

1. In your app dashboard, go to **"App Admin"** → **"Use Cases"** → **"Instagram API"**
   - You should see a setup wizard with numbered steps

2. **Step 1: Add Required Messaging Permissions**
   - Click on the permissions section
   - You need to add these permissions:
     - `instagram_business_basic` - Basic Instagram Business account access
     - `instagram_manage_comments` - Manage comments on Instagram posts
     - `instagram_business_manage_messages` - Send and receive Instagram DMs
   - Click "Add" or "Request" for each permission
   - **Note:** These permissions will need to be submitted for review later

3. **Step 2: Generate Access Tokens** (Skip for now - you'll do this after webhook setup)
   - This step requires adding an Instagram account
   - You'll complete this after configuring webhooks and during OAuth flow setup

4. **Step 3: Configure Webhooks** (Do this now)
   - You'll see a "Callback URL" field and "Verify token" field
   - **Callback URL:** Enter `https://your-app.up.railway.app/webhooks/meta`
     - Replace `your-app.up.railway.app` with your actual domain
   - **Verify token:** Enter the token you generated earlier (from `META_WEBHOOK_VERIFY_TOKEN` env variable)
   - Click "Save" or "Verify"
   - **Note:** Webhooks only work when your app is in "Published" state (after app review)

5. **Step 4: Set Up Instagram Business Login** (Required for OAuth)
   - This sets up the OAuth flow for merchants to connect their Instagram accounts
   - Follow the prompts to configure business login
   - You'll need to set OAuth redirect URIs (see Step 5 below)

6. **Step 5: Complete App Review** (Do this after all setup is done)
   - You'll need to submit your app for review before it can access live data
   - Complete all other steps first, then submit for review

### Step 4: Configure App Domains

1. Go to **Settings → Basic** in your Meta app dashboard
2. Under "App Domains", add:
   - Your production domain (e.g., `your-app.up.railway.app` or your custom domain)
   - Your development domain (if different)
3. **Important:** Use the same domain as your Shopify app to maintain consistency

### Step 5: Configure OAuth Redirect URIs

1. In **Settings → Basic**, scroll to "Valid OAuth Redirect URIs"
2. Add your redirect URIs:
   ```
   https://your-app.up.railway.app/auth/instagram/callback
   https://your-app.up.railway.app/api/auth/instagram/callback
   ```
   (Use your actual domain - these are examples)
3. Add both production and development URLs if needed

### Step 6: Configure Additional Instagram Settings

1. In **App Admin → Use Cases → Instagram API**, you should see all the settings you need
2. If you need additional settings, go to **Settings → Basic**:
   - **Deauthorize Callback URL:** `https://your-app.up.railway.app/webhooks/meta/deauthorize`
     - (You'll implement this endpoint later if needed)
   - **Data Deletion Request URL:** `https://your-app.up.railway.app/webhooks/meta/data-deletion`
     - (You'll implement this endpoint later if needed)
3. **Note:** The main configuration is done in the Instagram API use case section you're already in

---

## App Configuration for Meta Review

### Step 7: App Review Information

1. Go to **App Review → Permissions and Features**
2. Request the following permissions (you'll need to submit for review):
   - `instagram_basic` - Basic Instagram account information
   - `instagram_manage_comments` - Manage comments on Instagram posts
   - `instagram_manage_messages` - Send and receive Instagram DMs
   - `pages_show_list` - List Facebook Pages user manages
   - `pages_manage_metadata` - Access Page metadata
   - `pages_read_engagement` - Read Page engagement data

3. For each permission, provide:
   - **Use Case:** "This app helps merchants automatically respond to customer inquiries on Instagram, providing product information and checkout links when customers express purchase intent."
   - **Instructions:** Step-by-step instructions for Meta reviewers
   - **Screencast/Video:** Optional but recommended - show the full flow

### Step 8: Privacy Policy & Terms

1. **Privacy Policy URL:**
   - Use your Shopify app's privacy policy URL
   - Example: `https://your-app.up.railway.app/privacy`
   - Must be publicly accessible and comprehensive

2. **Terms of Service URL:**
   - Use your Shopify app's terms URL
   - Example: `https://your-app.up.railway.app/terms`
   - Must be publicly accessible

3. **Data Deletion Instructions:**
   - Create a page explaining how users can request data deletion
   - Example: `https://your-app.up.railway.app/data-deletion`
   - Link this in Meta App Dashboard → Settings → Basic → Data Deletion Request URL

### Step 9: App Display Information

1. **App Icon:**
   - Upload a professional icon (1024x1024px)
   - Should be generic (not "SocialRepl" branded)
   - Use a customer service or messaging icon

2. **App Category:**
   - Select "Business" or "Customer Service"
   - NOT "Social" or "Marketing"

3. **App Description:**
   - Generic description focusing on customer service automation
   - Example: "Automated customer service tool for Instagram Business accounts that helps merchants respond to customer inquiries and provide product information."

---

## Environment Variables Setup

Add these environment variables to your `.env` file and Railway/production environment:

```bash
# Meta App Credentials
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret

# Meta Webhook Configuration
META_WEBHOOK_VERIFY_TOKEN=your_random_secure_token_here
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Meta API Version (optional, defaults to latest)
META_API_VERSION=v21.0

# Your App Domain (for OAuth redirects)
APP_URL=https://your-app.up.railway.app
```

### How to Get Meta App Credentials

1. Go to **Settings → Basic** in your Meta app dashboard
2. Copy:
   - **App ID** → `META_APP_ID`
   - **App Secret** → `META_APP_SECRET` (click "Show" to reveal)

### Generate Webhook Verify Token

Run this command to generate a secure random token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and use it as `META_WEBHOOK_VERIFY_TOKEN`. **Keep this secret** - you'll need it when configuring webhooks in Meta Dashboard.

---

## Webhook Setup

### Step 10: Configure Webhook Endpoint in Your Code

Your webhook endpoint should be at `/webhooks/meta` (already planned in Week 6 of your development plan).

**File:** `app/routes/webhooks.meta.jsx`

```javascript
import crypto from "crypto";

// Polyfill crypto for webhook validation
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}
if (typeof global.crypto === "undefined") {
  global.crypto = crypto;
}

const META_WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;

// GET endpoint for webhook verification
export async function loader({ request }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // Verify the webhook
  if (mode === "subscribe" && token === META_WEBHOOK_VERIFY_TOKEN) {
    console.log("[webhook] Meta webhook verified");
    return new Response(challenge, { status: 200 });
  }

  console.error("[webhook] Meta webhook verification failed");
  return new Response("Forbidden", { status: 403 });
}

// POST endpoint for webhook events
export async function action({ request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    // Verify HMAC signature (if Meta requires it)
    if (META_APP_SECRET && signature) {
      const expectedSignature = `sha256=${crypto
        .createHmac("sha256", META_APP_SECRET)
        .update(body)
        .digest("hex")}`;

      if (signature !== expectedSignature) {
        console.error("[webhook] Invalid HMAC signature");
        return new Response("Invalid signature", { status: 403 });
      }
    }

    const data = JSON.parse(body);
    console.log("[webhook] Meta webhook received:", JSON.stringify(data, null, 2));

    // Process webhook data here (implement in Week 8)
    // For now, just log it

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[webhook] Error processing Meta webhook:", error);
    return new Response("Error", { status: 500 });
  }
}
```

### Step 11: Configure Webhook in Meta Dashboard

1. Go to **Products → Webhooks** in your Meta app dashboard
2. Click "Add Callback URL"
3. Enter:
   - **Callback URL:** `https://your-app.up.railway.app/webhooks/meta`
   - **Verify Token:** The same token you set in `META_WEBHOOK_VERIFY_TOKEN`
4. Click "Verify and Save"
5. Once verified, subscribe to these events:
   - `messages` - Instagram DMs
   - `messaging_postbacks` - Postback events
   - `comments` - Instagram comments (if available)
   - `messaging_optins` - User opt-ins
   - `messaging_referrals` - Referral events

### Step 12: Test Webhook

1. In Meta Dashboard → Webhooks, click "Test" next to your webhook
2. Select an event type to test
3. Check your server logs to confirm the webhook is received
4. Verify the webhook shows as "Verified" in Meta Dashboard

---

## Database Schema Requirements

You'll need a table to store Meta authentication data. Add this to your Supabase database:

```sql
-- Meta authentication table
CREATE TABLE IF NOT EXISTS meta_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL, -- Facebook Page ID
  ig_business_id TEXT NOT NULL, -- Instagram Business Account ID
  user_access_token TEXT NOT NULL, -- Encrypted user access token
  page_access_token TEXT NOT NULL, -- Encrypted page access token
  ig_access_token TEXT, -- Encrypted Instagram access token
  token_expires_at TIMESTAMPTZ, -- Token expiration timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, page_id) -- One connection per shop per page
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_meta_auth_shop_id ON meta_auth(shop_id);
CREATE INDEX IF NOT EXISTS idx_meta_auth_ig_business_id ON meta_auth(ig_business_id);
```

**Note:** Tokens should be encrypted using your existing `encryptToken` function from `app/lib/crypto.server.js`.

---

## Code Integration Points

### Step 13: Create Meta Auth Helper Functions

**File:** `app/lib/meta.server.js` (create this file)

```javascript
import { encryptToken, decryptToken } from "./crypto.server";
import supabase from "./supabase.server";

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Save Meta authentication data for a shop
 */
export async function saveMetaAuth(
  shopId,
  pageId,
  igBusinessId,
  userToken,
  pageToken,
  igToken,
  tokenExpiresAt
) {
  const { data, error } = await supabase
    .from("meta_auth")
    .upsert(
      {
        shop_id: shopId,
        page_id: pageId,
        ig_business_id: igBusinessId,
        user_access_token: encryptToken(userToken),
        page_access_token: encryptToken(pageToken),
        ig_access_token: igToken ? encryptToken(igToken) : null,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "shop_id,page_id",
      }
    )
    .select()
    .single();

  if (error) {
    console.error("Error saving Meta auth:", error);
    throw error;
  }

  return data;
}

/**
 * Get Meta authentication data for a shop
 */
export async function getMetaAuth(shopId) {
  const { data, error } = await supabase
    .from("meta_auth")
    .select("*")
    .eq("shop_id", shopId)
    .single();

  if (error || !data) {
    return null;
  }

  // Decrypt tokens
  return {
    ...data,
    user_access_token: decryptToken(data.user_access_token),
    page_access_token: decryptToken(data.page_access_token),
    ig_access_token: data.ig_access_token
      ? decryptToken(data.ig_access_token)
      : null,
  };
}

/**
 * Refresh Meta access token
 */
export async function refreshMetaToken(shopId) {
  const auth = await getMetaAuth(shopId);
  if (!auth) {
    throw new Error("No Meta auth found for shop");
  }

  // Check if token needs refresh (expiring in < 7 days)
  const expiresAt = new Date(auth.token_expires_at);
  const now = new Date();
  const daysUntilExpiry = (expiresAt - now) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry > 7) {
    return auth; // Token is still valid
  }

  // Refresh token using Meta's endpoint
  const response = await fetch(
    `${META_API_BASE}/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${META_APP_ID}&` +
      `client_secret=${META_APP_SECRET}&` +
      `fb_exchange_token=${auth.user_access_token}`
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error.message}`);
  }

  // Update stored token
  const newExpiresAt = new Date(
    Date.now() + (data.expires_in || 5184000) * 1000
  ).toISOString();

  await saveMetaAuth(
    shopId,
    auth.page_id,
    auth.ig_business_id,
    data.access_token,
    auth.page_access_token,
    auth.ig_access_token,
    newExpiresAt
  );

  return await getMetaAuth(shopId);
}

/**
 * Make authenticated request to Meta Graph API
 */
export async function metaGraphAPI(endpoint, accessToken, options = {}) {
  const url = `${META_API_BASE}${endpoint}`;
  const params = new URLSearchParams({
    access_token: accessToken,
    ...options.params,
  });

  const response = await fetch(`${url}?${params}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Meta API error: ${data.error.message}`);
  }

  return data;
}
```

### Step 14: Create Instagram OAuth Route

**File:** `app/routes/auth.instagram.jsx` (create this file)

```javascript
import { redirect } from "react-router";

const META_APP_ID = process.env.META_APP_ID;
const APP_URL = process.env.APP_URL || process.env.SHOPIFY_APP_URL;

export async function loader({ request }) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return new Response("Missing shop parameter", { status: 400 });
  }

  // Build OAuth URL
  const redirectUri = `${APP_URL}/auth/instagram/callback?shop=${encodeURIComponent(shop)}`;
  const scopes = [
    "instagram_basic",
    "pages_show_list",
    "pages_manage_metadata",
    "instagram_manage_comments",
    "instagram_manage_messages",
  ].join(",");

  const authUrl = `https://www.facebook.com/${process.env.META_API_VERSION || "v21.0"}/dialog/oauth?` +
    `client_id=${META_APP_ID}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `response_type=code&` +
    `state=${encodeURIComponent(shop)}`;

  return redirect(authUrl);
}
```

### Step 15: Create Instagram OAuth Callback Route

**File:** `app/routes/auth.instagram.callback.jsx` (create this file)

```javascript
import { redirect } from "react-router";
import { getShopByDomain } from "../lib/db.server";
import { saveMetaAuth, metaGraphAPI } from "../lib/meta.server";

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";
const APP_URL = process.env.APP_URL || process.env.SHOPIFY_APP_URL;

export async function loader({ request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop") || url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    console.error("Instagram OAuth error:", error);
    return redirect(`/app?error=${encodeURIComponent(error)}`);
  }

  if (!code || !shop) {
    return new Response("Missing code or shop", { status: 400 });
  }

  try {
    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?` +
      `client_id=${META_APP_ID}&` +
      `client_secret=${META_APP_SECRET}&` +
      `redirect_uri=${encodeURIComponent(`${APP_URL}/auth/instagram/callback?shop=${shop}`)}&` +
      `code=${code}`;

    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message);
    }

    const userAccessToken = tokenData.access_token;

    // Get user's Pages
    const pagesData = await metaGraphAPI("/me/accounts", userAccessToken);
    
    if (!pagesData.data || pagesData.data.length === 0) {
      return redirect(`/app?error=${encodeURIComponent("No Facebook Pages found. Please create a Page and link it to an Instagram Business account.")}`);
    }

    // For now, use the first page (you can add a selection UI later)
    const page = pagesData.data[0];
    const pageAccessToken = page.access_token;

    // Get Instagram Business Account linked to this Page
    const igAccountData = await metaGraphAPI(
      `/${page.id}?fields=instagram_business_account`,
      pageAccessToken
    );

    if (!igAccountData.instagram_business_account) {
      return redirect(`/app?error=${encodeURIComponent("No Instagram Business account linked to this Facebook Page. Please link an Instagram Business account in Facebook Page settings.")}`);
    }

    const igBusinessId = igAccountData.instagram_business_account.id;

    // Get long-lived token
    const longLivedTokenUrl = `https://graph.facebook.com/${META_API_VERSION}/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${META_APP_ID}&` +
      `client_secret=${META_APP_SECRET}&` +
      `fb_exchange_token=${userAccessToken}`;

    const longLivedResponse = await fetch(longLivedTokenUrl);
    const longLivedData = await longLivedResponse.json();

    const expiresAt = longLivedData.expires_in
      ? new Date(Date.now() + longLivedData.expires_in * 1000).toISOString()
      : null;

    // Get shop from database
    const shopData = await getShopByDomain(shop);
    if (!shopData) {
      return redirect(`/app?error=${encodeURIComponent("Shop not found")}`);
    }

    // Save Meta auth
    await saveMetaAuth(
      shopData.id,
      page.id,
      igBusinessId,
      longLivedData.access_token || userAccessToken,
      pageAccessToken,
      pageAccessToken, // Use page token for IG API calls
      expiresAt
    );

    return redirect("/app/instagram?connected=true");
  } catch (error) {
    console.error("Instagram OAuth callback error:", error);
    return redirect(`/app?error=${encodeURIComponent(error.message)}`);
  }
}
```

---

## Meta Review Submission Checklist

Before submitting your app for Meta review, ensure:

### ✅ App Configuration
- [ ] App name is "SocialRepl.ai" (matches Shopify App Store for consistency)
- [ ] Privacy settings configured to hide developer status from personal profile
- [ ] App contact email is set (business email recommended)
- [ ] App icon is professional and matches your brand
- [ ] Privacy Policy URL is set and publicly accessible (same as Shopify app)
- [ ] Terms of Service URL is set and publicly accessible (same as Shopify app)
- [ ] Data Deletion Request URL is set and publicly accessible
- [ ] App Domains are configured correctly
- [ ] OAuth Redirect URIs are configured correctly

### ✅ Permissions Requested
- [ ] `instagram_basic` - Use case documented
- [ ] `instagram_manage_comments` - Use case documented
- [ ] `instagram_manage_messages` - Use case documented
- [ ] `pages_show_list` - Use case documented
- [ ] `pages_manage_metadata` - Use case documented

### ✅ Webhooks
- [ ] Webhook endpoint is implemented and verified
- [ ] Webhook callback URL is set in Meta Dashboard
- [ ] Webhook verify token is configured
- [ ] Webhook events are subscribed (messages, comments, etc.)
- [ ] Webhook endpoint is publicly accessible (HTTPS)

### ✅ Testing
- [ ] OAuth flow works end-to-end
- [ ] Webhook verification works
- [ ] Webhook events are received and logged
- [ ] Token refresh logic works
- [ ] Error handling is implemented

### ✅ Documentation
- [ ] Step-by-step instructions for Meta reviewers
- [ ] Screencast/video showing the full flow (recommended)
- [ ] Test account credentials provided (if required)
- [ ] Clear explanation of how the app helps merchants

### ✅ Privacy & Compliance
- [ ] Privacy policy explains data collection and use
- [ ] Terms of service are clear
- [ ] Data deletion process is documented
- [ ] App does not violate Meta's policies
- [ ] Messages appear to come from merchant, not app

---

## Important Notes

1. **Personal Privacy:** Meta requires you to sign in with your personal Facebook account, but you can configure privacy settings to hide your developer status. Set app visibility to "Only Me" in your Facebook profile settings, and your friends won't be able to discover that you're the developer. The app is associated with your developer account, which is separate from your personal profile visibility.

2. **App Name Consistency:** Using "SocialRepl.ai" in Meta Dashboard ensures merchants see the same app name during OAuth as they see in Shopify App Store, maintaining brand consistency across platforms.

3. **Message Privacy:** The app name is visible to merchants during OAuth connection, but NOT to end users (customers). End users only see messages from the merchant's Instagram account, never your name or the app name.

4. **Review Timeline:** Meta app review can take 7-14 business days. Plan accordingly.

5. **Test Mode:** Your app starts in "Development" mode. You can test with your own accounts, but you need to submit for review to go live.

6. **Rate Limits:** Meta has rate limits on API calls. Implement rate limiting in your code (see Week 10 of your development plan).

7. **Token Expiration:** Long-lived tokens expire in ~60 days. Implement automatic token refresh (see `refreshMetaToken` function above).

---

## Next Steps

After completing this setup:

1. **Week 6:** Implement webhook verification and basic webhook handling
2. **Week 7:** Implement Instagram OAuth flow and token storage
3. **Week 8:** Implement webhook payload parsing for comments and DMs
4. **Week 9+:** Continue with AI classification and automation features

For questions or issues, refer to:
- [Meta for Developers Documentation](https://developers.facebook.com/docs)
- [Instagram Graph API Documentation](https://developers.facebook.com/docs/instagram-api)
- [Meta App Review Guidelines](https://developers.facebook.com/docs/app-review)


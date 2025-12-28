# Meta Webhook Setup Guide

## Finding Webhooks in Meta App Dashboard

The location of webhooks can vary. Try these locations:

### Method 1: Under Instagram Product
1. Go to [Meta App Dashboard](https://developers.facebook.com/apps/)
2. Select your app
3. In the left sidebar, look for **"Instagram"** or **"Instagram Graph API"**
4. Click on it
5. Look for **"Webhooks"** or **"Subscriptions"** in the submenu
6. If you see **"Webhooks"**, click it

### Method 2: Under Messenger Product
1. In your app dashboard, look for **"Messenger"** in the left sidebar
2. Click on it
3. Look for **"Webhooks"** in the submenu
4. Instagram messaging webhooks are sometimes configured here

### Method 3: Direct URL
Try navigating directly to:
- `https://developers.facebook.com/apps/{YOUR_APP_ID}/webhooks/`
- Replace `{YOUR_APP_ID}` with your actual App ID

### Method 4: Settings → Basic
1. Go to **Settings → Basic**
2. Scroll down to find **"Webhooks"** section
3. Some apps have webhook configuration here

### Method 5: Products Section
1. In the left sidebar, look for **"Products"** or **"Add Product"**
2. If you see **"Instagram"** or **"Messenger"** listed, click on it
3. Look for **"Webhooks"** or **"Subscriptions"** tab

## If Webhooks Option Doesn't Exist

### Option A: Add Instagram Product First
1. Go to **"Add Product"** or **"Products"** in the left sidebar
2. If **"Instagram"** is not listed, click **"Add Product"**
3. Search for **"Instagram Graph API"** or **"Instagram"**
4. Add it to your app
5. After adding, **"Webhooks"** should appear under the Instagram product

### Option B: Use Graph API Explorer (Programmatic Setup)
If you can't find the webhook UI, you can subscribe programmatically:

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app from the dropdown
3. Get a Page Access Token (from your `meta_auth` table - use the `page_access_token`)
4. Make a POST request to subscribe:

```bash
curl -X POST "https://graph.facebook.com/v21.0/{PAGE_ID}/subscribed_apps" \
  -d "access_token={PAGE_ACCESS_TOKEN}" \
  -d "subscribed_fields=messages,comments"
```

Replace:
- `{PAGE_ID}` with your Facebook Page ID (from `meta_auth.page_id`)
- `{PAGE_ACCESS_TOKEN}` with your page access token

### Option C: Check App Mode
Webhooks might only be available when:
- App is in **Live** mode (not Development mode)
- App has been submitted for review
- Business Verification is complete

To check:
1. Go to **Settings → Basic**
2. Look at **"App Mode"** - if it says "Development", you may need to publish it

## Webhook Configuration (Once You Find It)

When you find the Webhooks section:

1. **Callback URL:**
   ```
   https://dm-checkout-ai-production.up.railway.app/webhooks/meta
   ```

2. **Verify Token:**
   - Use the value from your `META_WEBHOOK_VERIFY_TOKEN` environment variable
   - If you don't have one, generate it:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```

3. **Subscription Fields:**
   - Check `messages` (for DMs)
   - Check `comments` (for comments)

4. Click **"Verify and Save"** or **"Subscribe"**

## Verify Webhook is Working

After configuring, test it:

```bash
curl -X GET "https://dm-checkout-ai-production.up.railway.app/webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

Should return: `test123`

## Alternative: Subscribe via API After OAuth

If you can't configure webhooks in the dashboard, we can subscribe programmatically after Instagram connection. The code already calls `subscribeToWebhooks()` after OAuth completes, but it might need to be enhanced to actually make the API call.

Let me know which method works for you, or if you need help with the programmatic subscription!


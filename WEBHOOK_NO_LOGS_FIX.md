# Fix: No Webhook Logs (Meta Not Sending Webhooks)

## Problem
No logs = Meta is not sending webhook events to your endpoint. This means the webhook subscription isn't working.

## Step 1: Verify Webhook Subscription in Meta Dashboard

1. Go to [Meta App Dashboard](https://developers.facebook.com/apps/)
2. Select your app
3. Go to **USE CASES** → **Instagram** → **Webhooks**
4. Check if webhook shows as **"Active"** or **"Subscribed"**
5. If it shows as inactive or not subscribed, click **"Verify and Save"** again

## Step 2: Check Instagram App Settings (CRITICAL)

1. Open **Instagram app** on your phone
2. Go to your business profile (@socialrepl.ai)
3. Tap **menu icon** (three lines) → **Settings and activity**
4. Go to **Messages and story replies**
5. Under **Message requests**, find **Connected tools**
6. **Toggle ON "Allow access to messages"** ✅

**This is the #1 reason webhooks don't work!**

## Step 3: Reconnect Instagram to Trigger Programmatic Subscription

The app automatically subscribes to webhooks when you connect Instagram. Let's reconnect:

1. Go to your app: `https://admin.shopify.com/store/dmteststore-2/apps/dm-checkout-ai/app`
2. **Disconnect Instagram** (if connected)
3. **Reconnect Instagram**
4. Check Railway logs for:
   ```
   [meta] Subscribing Page {pageId} to webhooks programmatically
   [meta] ✅ Successfully subscribed Page {pageId} to webhooks
   ```

## Step 4: Verify Webhook Endpoint is Accessible

Test if Meta can reach your webhook:

```bash
curl -X GET "https://dm-checkout-ai-production.up.railway.app/webhooks/meta?hub.mode=subscribe&hub.verify_token=KGRE9UyoRKuMzlllgTDKhp%2BleoWdPu8oX2zjFkxEQNQ%3D&hub.challenge=test123"
```

Should return: `test123`

If this doesn't work, your webhook endpoint isn't accessible.

## Step 5: Check Webhook Subscription Status via API

You can check if your Page is subscribed to webhooks:

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Get your Page Access Token (from `meta_auth.page_token_enc` in database, decrypted)
4. Make a GET request:

```
GET https://graph.facebook.com/v21.0/{PAGE_ID}/subscribed_apps
```

Replace `{PAGE_ID}` with your Facebook Page ID (from `meta_auth.page_id`)

This will show if your app is subscribed and what fields are subscribed.

## Step 6: Manual Subscription via Graph API

If automatic subscription didn't work, subscribe manually:

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Get Page Access Token (from database or generate one)
4. Make a POST request:

```
POST https://graph.facebook.com/v21.0/{PAGE_ID}/subscribed_apps
```

Body:
```json
{
  "access_token": "YOUR_PAGE_ACCESS_TOKEN",
  "subscribed_fields": "messages,comments"
}
```

Replace:
- `{PAGE_ID}` with your Page ID
- `YOUR_PAGE_ACCESS_TOKEN` with your page access token

## Step 7: Development Mode Limitations

**Important:** In Development Mode, Instagram webhooks may have limitations:
- May not receive real user messages
- May only work with test users
- Full functionality requires app to be published

If you're in Development Mode, this might be why webhooks aren't working.

## Most Common Issues

1. **"Allow access to messages" not enabled** (Step 2) - This is the #1 issue!
2. **Webhook not subscribed** - Check Meta Dashboard (Step 1)
3. **Development Mode limitations** - Webhooks may not work fully
4. **Webhook endpoint not accessible** - Test with curl (Step 4)

## Next Steps

1. ✅ Enable "Allow access to messages" in Instagram app (Step 2)
2. ✅ Reconnect Instagram to trigger subscription (Step 3)
3. ✅ Check Railway logs for subscription status
4. ✅ Verify webhook is active in Meta Dashboard
5. ✅ Test with another DM

If still no logs after these steps, the issue is likely Development Mode limitations. You may need to publish the app for full webhook functionality.


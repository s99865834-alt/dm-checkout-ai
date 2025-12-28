# Webhooks in Development Mode - Workaround

## The Problem

In **Development Mode**, Instagram webhooks may not be fully functional or visible in the Meta App Dashboard. This is a known limitation.

## Solution: Programmatic Webhook Subscription

Since webhooks aren't easily configurable in Development Mode, we'll subscribe programmatically using the Graph API. The code already does this automatically when you connect Instagram!

## How It Works

1. When you connect your Instagram account via OAuth, the app automatically calls `subscribeToWebhooks()`
2. This function makes an API call to Meta to subscribe your Page to webhooks
3. The subscription happens programmatically, bypassing the dashboard

## What You Need to Do

### Step 1: Ensure Webhook Endpoint is Accessible

Your webhook endpoint must be publicly accessible:
```
https://dm-checkout-ai-production.up.railway.app/webhooks/meta
```

Test it:
```bash
curl -X GET "https://dm-checkout-ai-production.up.railway.app/webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123"
```

Should return: `test123`

### Step 2: Set Environment Variables

Make sure these are set in Railway:
- `META_WEBHOOK_VERIFY_TOKEN` - A random secure token
- `META_APP_SECRET` - Your Meta App Secret

### Step 3: Reconnect Instagram

1. Go to your app's Home page
2. Disconnect Instagram (if connected)
3. Reconnect Instagram
4. The app will automatically try to subscribe to webhooks programmatically

### Step 4: Check Logs

After reconnecting, check your Railway logs for:
```
[meta] Subscribing Page {pageId} to webhooks programmatically
[meta] ✅ Successfully subscribed Page {pageId} to webhooks
```

Or if there's an error:
```
[meta] Error subscribing to webhooks: ...
```

## Manual Subscription (If Needed)

If automatic subscription doesn't work, you can subscribe manually using Graph API Explorer:

1. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app
3. Get a Page Access Token:
   - Use the token from your database (`meta_auth.page_token_enc` - decrypted)
   - Or generate one in Graph API Explorer
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
- `{PAGE_ID}` with your Facebook Page ID (from `meta_auth.page_id`)
- `YOUR_PAGE_ACCESS_TOKEN` with your page access token

## Limitations in Development Mode

- Webhooks may not receive real user messages (only test messages)
- Some webhook features may be limited
- You may need to publish the app for full webhook functionality

## After Publishing

Once your app is published (after Business Verification):
1. Webhooks will be fully functional
2. You'll be able to configure them in the dashboard
3. Real user messages will trigger webhooks

## Testing Webhooks

Even in Development Mode, you can test:
1. Send a test message to your Instagram account
2. Check Railway logs for webhook events
3. Check your database for new message entries

If webhooks are working, you'll see:
```
[webhook] Meta webhook event received
[webhook] Instagram message event: ...
[webhook] ✅ DM logged successfully
```

## Next Steps

1. ✅ Reconnect Instagram to trigger automatic subscription
2. ✅ Check Railway logs for subscription status
3. ✅ Send a test DM and check logs
4. ✅ Verify messages appear in `/app/messages` page

If it still doesn't work, the issue is likely that Development Mode webhooks are limited. You may need to wait until the app is published.


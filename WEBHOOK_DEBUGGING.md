# Webhook Debugging Guide

## Issue: DMs Not Appearing in App/Database

If you sent a DM to your Instagram account but nothing showed up, follow these debugging steps:

### 1. Check Server Logs

First, check if the webhook is being called at all. Look for these log messages in your Railway/deployment logs:

```
[webhook] Meta webhook event received
[webhook] Instagram webhook event
[webhook] Processing entry: ...
```

**If you don't see these logs:**
- The webhook is not being called by Meta
- Check webhook configuration in Meta App Dashboard (see step 2)

**If you see these logs:**
- The webhook is being called, but there might be an issue with parsing or shop resolution
- Check for error messages in the logs

### 2. Verify Webhook Configuration in Meta App Dashboard

1. Go to [Meta App Dashboard](https://developers.facebook.com/apps/)
2. Select your app
3. Go to **Webhooks** in the left sidebar
4. Verify:
   - **Callback URL**: `https://dm-checkout-ai-production.up.railway.app/webhooks/meta`
   - **Verify Token**: Should match `META_WEBHOOK_VERIFY_TOKEN` in your environment variables
   - **Subscription Fields**: Should include:
     - `messages` (for DMs)
     - `comments` (for comments)

### 3. Check Thread Control (CRITICAL for Instagram DMs)

Instagram requires your app to have **thread control** to receive DM webhooks. This is often the main issue!

1. Go to your **Facebook Page** (the one linked to your Instagram account)
2. Go to **Settings** → **Advanced Messaging**
3. Under **Default Routing App**, select your app
4. Enable **"Allow this app to take control of conversations"**
5. Save changes

**Without thread control, Instagram will NOT send webhook events for DMs!**

### 4. Verify App Permissions

Ensure your app has these permissions:
- `instagram_manage_messages` ✅
- `instagram_basic` ✅
- `pages_messaging` (for Facebook Page messaging)

### 5. Test Webhook Endpoint

Test if your webhook endpoint is accessible:

```bash
curl -X GET "https://dm-checkout-ai-production.up.railway.app/webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

Should return: `test123`

### 6. Check Database Connection

Verify that:
- Your `meta_auth` table has an entry for your shop
- The `ig_business_id` in `meta_auth` matches your Instagram Business Account ID
- The shop is marked as `active: true` in the `shops` table

### 7. Test with Different Account

Sometimes messages from the same account used for development don't trigger webhooks. Try:
- Sending a DM from a different Instagram account
- Sending a DM from a friend's account

### 8. Check Webhook Payload Structure

If webhooks are being received but not processed, check the logs for the full payload structure. Instagram webhook payloads can vary. Look for:

```
[webhook] Meta webhook event: { ... }
[webhook] Processing entry: { ... }
```

The expected structure for Instagram messaging:
```json
{
  "object": "instagram",
  "entry": [
    {
      "id": "INSTAGRAM_BUSINESS_ACCOUNT_ID",
      "messaging": [
        {
          "sender": { "id": "USER_ID" },
          "recipient": { "id": "INSTAGRAM_BUSINESS_ACCOUNT_ID" },
          "timestamp": 1234567890,
          "message": {
            "mid": "MESSAGE_ID",
            "text": "Message text"
          }
        }
      ]
    }
  ]
}
```

### 9. Common Issues

**Issue: "Could not resolve shop for Instagram Business Account"**
- Solution: Check that `ig_business_id` in `meta_auth` matches the `entry.id` from the webhook
- The `entry.id` should be your Instagram Business Account ID

**Issue: "No messaging events found in entry"**
- Solution: Check the webhook payload structure in logs
- Instagram might be sending events in a different format
- Ensure thread control is enabled (see step 3)

**Issue: HMAC verification failing**
- Solution: Check that `META_APP_SECRET` matches your app secret in Meta Dashboard
- The webhook will still process if HMAC verification is skipped (but it's logged as a warning)

### 10. Enable More Logging

The webhook handler now includes extensive logging. Check your deployment logs for:
- Full webhook payloads
- Entry processing details
- Shop resolution results
- Message parsing results
- Database insertion results

### Next Steps

1. Check your Railway deployment logs for webhook events
2. Verify thread control is enabled (most common issue!)
3. Test the webhook endpoint manually
4. Send another test DM and watch the logs in real-time

If webhooks are still not working after these steps, the issue is likely:
- Thread control not enabled
- Webhook not properly subscribed in Meta Dashboard
- App not in Live mode (if required)


# Webhook Troubleshooting - DM Not Appearing

## Step 1: Check Railway Logs

**Most Important:** Check your Railway deployment logs right after sending a DM. Look for:

### ✅ If webhook IS being called:
```
[webhook] Meta webhook event received
[webhook] Instagram webhook event
[webhook] Processing entry: ...
```

### ❌ If webhook is NOT being called:
- No logs at all = Meta isn't sending webhooks
- Possible causes:
  1. Webhook not properly subscribed in Meta Dashboard
  2. "Allow access to messages" not enabled in Instagram app
  3. Thread control not configured
  4. App in Development mode (webhooks may be limited)

## Step 2: Check for Errors in Logs

If you see webhook logs, look for these error messages:

### Error: "Could not resolve shop for Instagram Business Account"
- **Cause:** `entry.id` from webhook doesn't match `ig_business_id` in your database
- **Fix:** Check that `meta_auth.ig_business_id` matches the Instagram Business Account ID from the webhook

### Error: "No messaging events found in entry"
- **Cause:** Webhook payload structure is different than expected
- **Fix:** Check the full webhook payload in logs to see actual structure

### Error: "Invalid HMAC signature"
- **Cause:** `META_APP_SECRET` doesn't match Meta Dashboard
- **Fix:** Verify `META_APP_SECRET` in Railway matches Meta Dashboard → Settings → Basic → App Secret

### Error: "Failed to parse message event"
- **Cause:** Message payload structure is different
- **Fix:** Check the actual message structure in logs

## Step 3: Verify Database Records

Check your `meta_auth` table in Supabase:

```sql
SELECT shop_id, page_id, ig_business_id 
FROM meta_auth 
WHERE shop_id = 'YOUR_SHOP_ID';
```

Verify:
- `ig_business_id` exists and is not null
- `page_id` exists and is not null
- Shop is active: `SELECT active FROM shops WHERE id = 'YOUR_SHOP_ID';`

## Step 4: Test Webhook Manually

Send a test webhook payload to see what happens:

```bash
curl -X POST https://dm-checkout-ai-production.up.railway.app/webhooks/meta \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=..." \
  -d '{
    "object": "instagram",
    "entry": [{
      "id": "YOUR_IG_BUSINESS_ID",
      "messaging": [{
        "sender": {"id": "123456"},
        "recipient": {"id": "YOUR_IG_BUSINESS_ID"},
        "timestamp": 1234567890,
        "message": {
          "mid": "test_message_123",
          "text": "Test message"
        }
      }]
    }]
  }'
```

Replace:
- `YOUR_IG_BUSINESS_ID` with your actual Instagram Business Account ID from `meta_auth` table

## Step 5: Common Issues

### Issue 1: Development Mode Limitations
- **Symptom:** Webhooks verified but no events received
- **Solution:** Development mode webhooks may not receive real user messages. You may need to publish the app.

### Issue 2: Wrong Instagram Business ID
- **Symptom:** "Could not resolve shop" error
- **Solution:** The `entry.id` in webhook must match `ig_business_id` in database exactly

### Issue 3: Webhook Not Subscribed
- **Symptom:** No webhook logs at all
- **Solution:** 
  1. Check Meta Dashboard → Webhooks → Verify subscription is active
  2. Reconnect Instagram to trigger programmatic subscription
  3. Check Railway logs for subscription status

### Issue 4: HMAC Verification Failing
- **Symptom:** "Invalid signature" errors
- **Solution:** Verify `META_APP_SECRET` in Railway matches Meta Dashboard

## Step 6: Enable More Logging

The webhook handler already has extensive logging. Check logs for:
- Full webhook payload: `[webhook] Meta webhook event: ...`
- Entry details: `[webhook] Processing entry: ...`
- Shop resolution: `[webhook] Resolved shop ...`
- Message parsing: `[webhook] Parsed message: ...`
- Database insertion: `[webhook] ✅ DM logged successfully`

## Next Steps

1. **Check Railway logs immediately after sending a DM**
2. **Share the logs** - especially any errors or the full webhook payload
3. **Verify database** - check `meta_auth` table has correct `ig_business_id`
4. **Test webhook endpoint** - verify it's accessible and responding

The logs will tell us exactly where the issue is!


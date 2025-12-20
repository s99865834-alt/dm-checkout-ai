# Meta Webhook Testing Guide

## Week 6: Testing Webhook Verification

### Prerequisites

1. ✅ Webhook endpoint created: `app/routes/webhooks.meta.jsx`
2. ✅ Environment variables set in `.env`:
   - `META_WEBHOOK_VERIFY_TOKEN` (the token you generated)
   - `META_APP_SECRET` (optional, for HMAC verification)
3. ✅ Webhook configured in Meta Dashboard with callback URL

---

## Test 1: Webhook Verification (GET Request)

This tests that Meta can verify your webhook endpoint.

### Using curl:

```bash
# Replace YOUR_VERIFY_TOKEN with your actual token from .env
curl "http://localhost:3000/webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

**Expected response:** `test123` (the challenge value)

**If you get 403 Forbidden:**
- Check that `META_WEBHOOK_VERIFY_TOKEN` in `.env` matches the token you're using
- Make sure you're using the correct token (the one you set in Meta Dashboard)

### Using your browser:

1. Start your dev server: `npm run dev`
2. Open browser and go to:
   ```
   http://localhost:3000/webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123
   ```
3. You should see: `test123`

---

## Test 2: Webhook Event (POST Request)

This simulates a webhook event from Meta.

### Using curl:

```bash
# Test Instagram message event
curl -X POST http://localhost:3000/webhooks/meta \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=test" \
  -d '{
    "object": "instagram",
    "entry": [{
      "id": "test_entry_id",
      "messaging": [{
        "sender": {"id": "123456"},
        "recipient": {"id": "789012"},
        "message": {
          "text": "Hello, I want to buy this product"
        },
        "timestamp": 1234567890
      }]
    }]
  }'
```

**Expected response:** `OK`

**Check your server logs** - you should see:
```
[webhook] Meta webhook event received
[webhook] Meta webhook event: { ... }
[webhook] Instagram webhook event
[webhook] Processing entry: test_entry_id
[webhook] Instagram message event: { ... }
```

---

## Test 3: HMAC Signature Verification (Optional)

If you have `META_APP_SECRET` set, test HMAC verification:

```bash
# Generate a valid HMAC signature
# (This is just for testing - Meta will generate real signatures)

# In Node.js:
node -e "
const crypto = require('crypto');
const body = JSON.stringify({object: 'instagram', entry: []});
const secret = 'YOUR_APP_SECRET';
const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
console.log('Signature:', signature);
console.log('Body:', body);
"
```

Then use that signature in your curl request:
```bash
curl -X POST http://localhost:3000/webhooks/meta \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=GENERATED_SIGNATURE" \
  -d 'BODY_FROM_ABOVE'
```

---

## Testing with Meta Dashboard

### Option 1: Use Meta's Test Tool

1. Go to **App Admin → Use Cases → Instagram API → Step 3: Configure webhooks**
2. Click "Test" button (if available)
3. Select an event type to test
4. Check your server logs for the event

**Note:** This only works when your app is published. For now, use the manual tests above.

### Option 2: Send Real Events

1. Make sure your Instagram account is connected as a tester
2. Send a real DM or comment to your Instagram account
3. Check your server logs for the webhook event

**Note:** This requires your app to be in Development mode with test users added.

---

## Common Issues

### Issue: 403 Forbidden on verification

**Cause:** Token mismatch

**Solution:**
1. Check `META_WEBHOOK_VERIFY_TOKEN` in `.env`
2. Make sure it matches the token in Meta Dashboard
3. Restart your dev server after changing `.env`

### Issue: No events received

**Cause:** Webhooks only work when app is published

**Solution:**
- For now, use manual curl tests
- Real events will work after app review and publishing

### Issue: HMAC verification fails

**Cause:** Signature doesn't match

**Solution:**
1. Make sure `META_APP_SECRET` is set correctly
2. Meta generates signatures automatically - you don't need to generate them manually
3. For testing, you can temporarily disable HMAC verification

---

## Next Steps (Week 8)

After webhook verification works:
1. ✅ Week 6: Webhook setup complete
2. ⏭️ Week 7: Build OAuth flow to connect Instagram accounts
3. ⏭️ Week 8: Process webhook events (comments and DMs)
4. ⏭️ Week 8: Store events in database
5. ⏭️ Week 8: Trigger AI classification

---

## Quick Test Checklist

- [ ] Webhook verification (GET) returns challenge
- [ ] Webhook events (POST) return "OK"
- [ ] Events are logged in server console
- [ ] HMAC verification works (if app secret is set)
- [ ] Error handling works (test with invalid token)


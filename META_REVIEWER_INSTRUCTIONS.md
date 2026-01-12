# Testing Instructions for Meta App Reviewers

## Overview
This app automates Instagram Direct Message responses for e-commerce businesses. It uses AI to classify customer messages and sends automated replies with checkout links.

## Important Note About Development Mode
**This app is currently in Development mode, so real-time webhooks from Instagram are not active.** However, you can test the full functionality using:
1. The built-in Webhook Demo page (recommended)
2. Meta App Dashboard's Test Webhook feature
3. The test webhook API endpoint

## Method 1: Using the Webhook Demo Page (Easiest)

### Step 1: Access the App
1. Open the Shopify app: [Your App URL]
2. Log in with a test Shopify store
3. Navigate to **"Webhook Demo"** in the app navigation

### Step 2: Test Webhook Functionality
1. On the Webhook Demo page, you'll see several test scenarios:
   - Purchase Intent: "I want to buy this product"
   - Product Question: "What colors does this come in?"
   - Size Inquiry: "Do you have this in a large size?"
   - Custom Message: Enter your own test message

2. Select a test scenario (or create a custom message)

3. Click **"Send Test Webhook"**

4. **Observe the Results**:
   - You'll see "Webhook processed successfully!" message
   - The page will show what happened:
     - ✅ Webhook received and validated
     - ✅ Message logged to database
     - ✅ AI classified message intent
     - ✅ Automated reply sent (if conditions met)

5. **Check Recent Messages**:
   - Scroll down to "Recent Messages (Database)" section
   - You'll see the test message you just sent
   - It will show:
     - Message text
     - AI intent classification
     - Confidence score
     - Timestamp

### Step 3: Verify Full Flow
1. Send multiple test webhooks with different messages
2. Observe how different message types are classified
3. Check that messages appear in the database
4. Verify that automated replies are triggered (check server logs if available)

## Method 2: Using Meta App Dashboard Test Feature

### Step 1: Access Meta App Dashboard
1. Go to Meta App Dashboard → Your App
2. Navigate to **Webhooks** → **Instagram**
3. Find the **"messages"** webhook field

### Step 2: Send Test Webhook
1. Click the **"Test"** button next to the "messages" field
2. A dialog will show a sample webhook payload
3. Click **"Send to My Server"**
4. This will send a test webhook to: `https://dm-checkout-ai-production.up.railway.app/webhooks/meta`

### Step 3: Verify Processing
1. Check the Webhook Demo page's "Recent Messages" section
2. The test message should appear there
3. Verify it was processed correctly

## Method 3: Using the Test Webhook API Endpoint

### Step 1: Send Test Webhook via API
Use curl or Postman to send a test webhook:

```bash
curl -X POST https://dm-checkout-ai-production.up.railway.app/meta/test-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "instagram",
    "entry": [{
      "id": "17841478724885002",
      "messaging": [{
        "sender": {"id": "test_user_123"},
        "recipient": {"id": "17841478724885002"},
        "message": {
          "mid": "test_message_123",
          "text": "I want to buy this product"
        },
        "timestamp": 1234567890
      }]
    }]
  }'
```

### Step 2: Verify Response
- You should receive: `{"success": true, "message": "Test webhook processed"}`
- Check the Webhook Demo page to see the message in the database

## What to Expect

### Successful Test Should Show:
1. **Webhook Reception**: Webhook is received and validated
2. **Database Logging**: Message appears in "Recent Messages" section
3. **AI Classification**: Message is classified with intent (e.g., "purchase", "question")
4. **Automated Reply**: If conditions are met, automated reply is sent (check server logs)

### Expected Behavior:
- **Purchase Intent Messages**: Should trigger automated reply with checkout link
- **Question Messages**: Should be classified but may not trigger automated reply (depends on settings)
- **All Messages**: Should be logged to database with AI classification

## Testing Different Scenarios

### Test Case 1: Purchase Intent
- **Message**: "I want to buy this product"
- **Expected**: 
  - Intent: "purchase"
  - High confidence score
  - Automated reply sent (if automation enabled)

### Test Case 2: Product Question
- **Message**: "What colors does this come in?"
- **Expected**:
  - Intent: "question" or "product_inquiry"
  - Message logged to database
  - May or may not trigger automated reply (depends on settings)

### Test Case 3: Size Inquiry
- **Message**: "Do you have this in a large size?"
- **Expected**:
  - Intent: "question" or "product_inquiry"
  - Message logged
  - Appropriate response based on settings

## Verification Checklist

- [ ] Can access the Webhook Demo page
- [ ] Can send test webhooks successfully
- [ ] Messages appear in "Recent Messages" section
- [ ] AI classification is working (intent shown)
- [ ] Database logging is working
- [ ] Automated replies are being sent (check server logs)
- [ ] Different message types are classified correctly

## Notes for Reviewers

1. **Development Mode Limitation**: 
   - Real Instagram DMs won't trigger webhooks until app is approved and in Live mode
   - This is expected behavior - use test webhooks to verify functionality

2. **Test Webhook vs Real Webhook**:
   - Test webhooks use the same processing logic as real webhooks
   - The only difference is the source (test vs Meta's servers)
   - Once approved, real webhooks will work identically

3. **Server Logs**:
   - For full verification, check server logs to see automated replies being sent
   - Logs will show: `[automation] DM sent successfully`

4. **Database Verification**:
   - All messages should appear in the "Recent Messages" section
   - This proves webhook → database flow is working

## Questions or Issues?

If you encounter any issues:
1. Check that the webhook URL is accessible: `https://dm-checkout-ai-production.up.railway.app/webhooks/meta`
2. Verify the Instagram Business account is connected in the app
3. Check server logs for any error messages
4. Try the Webhook Demo page method first (easiest)

## Contact

For questions during review, contact: [Your contact email]

# Test Webhook Examples for Meta App Review

Use these examples to test your webhook endpoint before Meta app approval.

## Test DM Webhook

```bash
curl -X POST https://www.socialrepl.ai/meta/test-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "instagram",
    "entry": [
      {
        "id": "YOUR_TEST_IG_BUSINESS_ID",
        "messaging": [
          {
            "sender": {
              "id": "test_user_123"
            },
            "recipient": {
              "id": "YOUR_TEST_IG_BUSINESS_ID"
            },
            "message": {
              "mid": "test_message_123",
              "text": "I want to buy this product"
            },
            "timestamp": 1234567890
          }
        ]
      }
    ]
  }'
```

## Test Comment Webhook

```bash
curl -X POST https://www.socialrepl.ai/meta/test-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "instagram",
    "entry": [
      {
        "id": "YOUR_TEST_IG_BUSINESS_ID",
        "changes": [
          {
            "field": "comments",
            "value": {
              "id": "test_comment_123",
              "text": "Love this! How do I buy it?",
              "from": {
                "id": "test_user_123",
                "username": "test_user"
              },
              "media": {
                "id": "test_media_123"
              }
            }
          }
        ]
      }
    ]
  }'
```

## Using Postman or Similar Tools

1. Create a new POST request
2. URL: `https://www.socialrepl.ai/meta/test-webhook`
3. Headers: `Content-Type: application/json`
4. Body: Use one of the JSON examples above
5. Replace `YOUR_TEST_IG_BUSINESS_ID` with your actual test Instagram Business Account ID

## For Screen Recording

1. Set up your app with a test Instagram Business account
2. Use the test webhook endpoint to simulate events
3. Record your screen showing:
   - The webhook being received
   - The message being processed
   - The AI response being generated
   - The checkout link being sent
   - The data appearing in your analytics


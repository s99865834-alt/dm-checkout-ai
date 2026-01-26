# Testing Instructions for Meta App Reviewers

## Overview (what this app does)
This app helps e-commerce merchants respond to **Instagram DMs and comments** with **policy-compliant automated replies**. It uses AI to classify inbound customer messages (for example: purchase intent vs product question) and then:
- Responds with a **product page / checkout link** when there is enough product context, or
- Asks a **clarifying question** when context is missing (PRO behavior), or
- Sends **no automated reply** when it would be unsafe to guess the intended product (non‑PRO behavior).

## Important note (Development mode)
This Meta app is currently in **Development mode**, so **real customer DMs may not trigger real-time webhooks** during review.

For review, you can still test the full webhook-processing logic using:
- **Method 1 (recommended)**: the in-app **Webhook Demo** page
- **Method 2**: Meta Dashboard **“Test”** webhook (Instagram → messages)
- **Method 3**: the app’s **test webhook endpoint**

## URLs (stable)
- **App base URL (production)**: `https://dm-checkout-ai-production.up.railway.app`
- **Webhook receiver**: `https://dm-checkout-ai-production.up.railway.app/webhooks/meta`
- **Test webhook endpoint**: `https://dm-checkout-ai-production.up.railway.app/meta/test-webhook`
- **Privacy policy**: `https://dm-checkout-ai-production.up.railway.app/privacy`
- **Terms**: `https://dm-checkout-ai-production.up.railway.app/terms`
- **Data deletion callback**: `https://dm-checkout-ai-production.up.railway.app/meta/data-deletion`

## How to access the Shopify embedded app (required)
This is an **embedded Shopify app**, so you must open it inside Shopify Admin.

1. Log into the provided Shopify test store Admin:
   - **Store**: `dmteststore-2.myshopify.com`
   - **Staff account**: (provided separately in the review submission)
2. In Shopify Admin, go to **Apps** → open **DM Checkout AI**.
3. In the app navigation, open **Webhook Demo** (`/app/webhook-demo`).

## Method 1 (recommended): In-app Webhook Demo

### Step 1: Choose a test type and scenario
On **Webhook Demo**, select one:
- **📩 Direct DM**: simulates a direct message **without product context**
- **💬 Comment → DM**: simulates a comment event that triggers a DM **with product context** (via post → product mapping)

Then pick a scenario (Purchase Intent / Product Question / Size Inquiry) and click **Send Test Webhook**.

### Step 2: Verify webhook processing results (Step 2 on page)
You should see:
- ✅ Webhook received and validated
- ✅ Message logged to the database
- ✅ AI classified intent (and confidence)
- ✅ Automation decision (send response vs ask clarifying question vs no response)

### Step 3: Verify database logging (Step 3 on page)
In **Recent Messages (Database)** you should see the newly created message with:
- Message text
- AI intent and confidence
- Timestamp
- **AI Response Sent** (if the app actually sent), or **AI Response Preview** (demo-only preview), or **No Response**

## Expected behavior (key rules the app follows)

### Rule A: User-initiated only
The app **only responds to inbound customer messages/comments**. It does not send unsolicited messages.

### Rule B: Direct DMs often have no product context
If the user sends a Direct DM like “I want to buy this product”, the app **does not know which product** they mean.

Therefore:
- **PRO behavior**: the app asks a clarifying question (example: “Which product are you interested in?”).
- **Non‑PRO behavior**: the app sends **no automated response** (to avoid guessing the wrong product).

### Rule C: Comment → DM has product context
For Comment → DM tests, the app can map the comment’s **Instagram media/post** to a Shopify product and may send a product link.

### Rule D: Confidence threshold
If AI confidence is below threshold, the app may choose **not** to send an automated reply.

## Method 2: Meta App Dashboard “Test” webhook
1. Meta App Dashboard → **Webhooks** → **Instagram**
2. Find **messages** → click **Test**
3. Click **Send to my server** (delivers to the webhook receiver URL above)
4. Open the in-app **Webhook Demo** page and confirm the event appears under **Recent Messages (Database)**.

## Method 3: Test webhook endpoint (API)
You can send a test payload directly:

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

## Data use and storage (summary)
- **What we process**: message text, sender/recipient IDs, timestamps, AI classification results, and generated reply text (for audit/debug).
- **Why**: to provide automated customer support and conversion flows requested by the merchant.
- **Deletion**: supported via Meta’s data deletion callback URL above.

## Troubleshooting
- If you can’t access the embedded app UI, ensure you are opening it inside Shopify Admin (Apps → DM Checkout AI).
- If events don’t appear, confirm the webhook receiver URL is reachable:
  - `https://dm-checkout-ai-production.up.railway.app/webhooks/meta`

## Contact
For questions during review, contact: **(provided in the review submission)**

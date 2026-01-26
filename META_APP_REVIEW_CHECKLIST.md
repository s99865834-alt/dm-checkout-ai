# Meta App Review Checklist for Instagram Messaging

Based on Meta's official requirements, here's everything you need for app approval:

## 🔗 Reference URLs (stable)

- **App base URL (production)**: `https://dm-checkout-ai-production.up.railway.app`
- **Webhook receiver**: `https://dm-checkout-ai-production.up.railway.app/webhooks/meta`
- **Test webhook endpoint**: `https://dm-checkout-ai-production.up.railway.app/meta/test-webhook`
- **Privacy policy**: `https://dm-checkout-ai-production.up.railway.app/privacy`
- **Terms**: `https://dm-checkout-ai-production.up.railway.app/terms`
- **Data deletion callback**: `https://dm-checkout-ai-production.up.railway.app/meta/data-deletion`

## ✅ What You Have (Completed)

1. **Webhook Endpoint Configured**
   - ✅ Webhook URL: `https://dm-checkout-ai-production.up.railway.app/webhooks/meta`
   - ✅ Verify token configured
   - ✅ Webhook handler processes Instagram messages

2. **Webhook Demo Page**
   - ✅ Interactive demo at `/app/webhook-demo`
   - ✅ Shows test webhook processing
   - ✅ Displays database logging
   - ✅ Demonstrates full automation flow

3. **Required Permissions**
   - ✅ `instagram_basic`
   - ✅ `instagram_manage_messages` (Advanced Access required)
   - ✅ `instagram_manage_comments` (Advanced Access required)
   - ✅ `pages_show_list`
   - ✅ `pages_read_engagement`
   - ✅ `pages_manage_metadata`

4. **Instagram Business Account Setup**
   - ✅ Business account connected (@socialrepl.ai)
   - ✅ Linked to Facebook Page
   - ✅ "Allow access to messages" enabled

5. **Webhook Subscription**
   - ✅ Subscribed to `messages` field
   - ✅ Subscription API working

## ⚠️ What You Still Need for App Review

### 1. **Screencast/Video Demonstration** (REQUIRED)
   - **What**: Record a video showing your app's functionality
   - **Duration**: 2-5 minutes recommended
   - **Must Show**:
     - Open Shopify Admin → Apps → **DM Checkout AI**
     - Navigate to **Webhook Demo** (`/app/webhook-demo`)
     - Send a **test webhook** (Direct DM and/or Comment → DM)
     - Show **AI classification** + **automation decision** (Step 2)
     - Show the message **logged in the database** (Step 3)
   - **How to Create**:
     - Use the Webhook Demo page (`/app/webhook-demo`)
     - Record screen while sending test webhooks
     - Show the results appearing in real-time
     - Upload to YouTube/Vimeo and provide link in submission

### 2. **Detailed Instructions for Reviewers** (REQUIRED)
   - **What**: Step-by-step guide for Meta reviewers to test your app
   - **Must Include**:
     - How to access your app
     - How to connect Instagram Business account
     - How to test webhook functionality
     - What to expect at each step
   - **Format**: Text document or markdown file

### 3. **App Review Submission** (REQUIRED)
   - **Where**: Meta App Dashboard → App Review → Requests
   - **What to Request**:
     - `instagram_manage_messages` (Advanced Access)
     - `instagram_manage_comments` (Advanced Access)
     - `pages_messaging` (if needed)
   - **For Each Permission, Provide**:
     - **Use Case**: Detailed explanation of how your app uses this permission
     - **User Benefit**: Why users would want this functionality
     - **Screencast Link**: Link to your demonstration video
     - **Instructions**: Step-by-step testing guide

### 4. **Platform Policies Compliance** (REQUIRED)
   - ✅ **User-Initiated Conversations**: Your app only responds to user messages (not sending unsolicited messages)
   - ✅ **24-Hour Window**: Automated replies only within 24-hour messaging window
   - ✅ **Privacy Policy**: `https://dm-checkout-ai-production.up.railway.app/privacy`
   - ✅ **Terms of Service**: `https://dm-checkout-ai-production.up.railway.app/terms`
   - ✅ **Data Deletion Callback**: `https://dm-checkout-ai-production.up.railway.app/meta/data-deletion`
   - ✅ **Data Usage**: Explain what data is stored (message text/IDs/timestamps + AI classification + reply text) and why (merchant-requested automation + audit/debug)

### 5. **Business Verification** (May be Required)
   - Check if your app type requires Business Verification
   - Some permissions require verified business account

### 6. **Test Account Setup for Reviewers**
   - Provide test Instagram Business account credentials (if needed)
   - Or clear instructions on how reviewers can test with their own accounts

## 📋 Submission Checklist

Before submitting, ensure:

- [ ] Screencast/video created and uploaded
- [ ] Detailed testing instructions written
- [ ] Privacy Policy URL added to app settings
- [ ] Terms of Service URL added to app settings
- [ ] App Review request created in Meta App Dashboard
- [ ] All permissions requested with detailed explanations
- [ ] Webhook demo page is accessible and working
- [ ] Test webhook functionality works end-to-end
- [ ] App complies with Meta Platform Policies
- [ ] Business Verification completed (if required)

## 🎥 Screencast Script Suggestion

1. **Introduction** (10 seconds)
   - "This app automates Instagram DM responses for e-commerce businesses"

2. **Show Webhook Demo Page** (30 seconds)
   - Navigate to `/app/webhook-demo`
   - Explain what the page does

3. **Send Test Webhook** (1 minute)
   - Select a test scenario
   - Click "Send Test Webhook"
   - Show results appearing in real-time
   - Show message appearing in "Recent Messages"

4. **Show Full Flow** (1-2 minutes)
   - Explain: Webhook → Database → AI Classification → Automated Reply
   - Show server logs (if possible) or explain what happens
   - Show the automated reply being sent

5. **Conclusion** (10 seconds)
   - "Once approved, this will work automatically for all Instagram messages"

## 📝 Permission Request Templates

### For `instagram_manage_messages`:

**Use Case:**
"Our app helps merchants respond to inbound Instagram DMs. The app classifies messages and responds only when it is safe and policy-compliant:
- If the DM has enough product context, it can send a product page/checkout link.
- If the DM lacks product context (e.g., 'I want to buy this product'), PRO tier asks a clarifying question ('Which product?'). Non‑PRO sends no automated reply to avoid guessing the wrong product."

**User Benefit:**
"Merchants can respond to customer inquiries instantly, even outside business hours, improving customer satisfaction and increasing sales conversions."

**Screencast:**
[Link to your video]

**Instructions:**
1. Log into the provided Shopify test store Admin → Apps → **DM Checkout AI**
2. Go to **Webhook Demo** (`/app/webhook-demo`)
3. Select **Direct DM** and send “I want to buy this product”
4. Expected: intent “purchase” with **no product context** → PRO asks clarifying question; non‑PRO sends no response
5. Select **Comment → DM** and send the same scenario
6. Expected: with product context → response may include product link (depending on mapping and confidence)

### For `instagram_manage_comments`:

**Use Case:**
"Our app automatically responds to Instagram comments on posts. When a customer comments with purchase intent, we send them a private DM with a checkout link."

**User Benefit:**
"Merchants can convert Instagram comments into sales by automatically engaging with interested customers."

## ⚠️ Important Notes

1. **Development Mode Limitation**: 
   - Real-time webhooks only work in Live mode
   - For review, use the test webhook functionality to demonstrate
   - Explain this limitation in your submission

2. **User-Initiated Conversations**:
   - ✅ Your app only responds (doesn't initiate)
   - ✅ Complies with Meta's policy

3. **24-Hour Messaging Window**:
   - ✅ Your app respects the 24-hour window
   - ✅ Only sends automated replies within the window

4. **Data Privacy**:
   - Ensure you explain how you store and use Instagram message data
   - Comply with GDPR/CCPA if applicable

## 🚀 Next Steps

1. **Create Screencast**: Record demo using Webhook Demo page
2. **Write Instructions**: Create detailed testing guide
3. **Add Privacy/Terms URLs**: Add to Meta App Dashboard settings
4. **Submit App Review**: Go to Meta App Dashboard → App Review → Request Permissions
5. **Wait for Review**: Typically takes 7-14 business days

## 📞 If Review is Rejected

Common reasons:
- Insufficient screencast detail
- Unclear use case explanation
- Missing privacy policy
- Policy violations

You can resubmit with improvements.

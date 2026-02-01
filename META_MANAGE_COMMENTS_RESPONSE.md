# Meta App Review Response: instagram_business_manage_comments

Our app, DM Checkout AI, uses the `instagram_business_manage_comments` permission to enable a critical feature called "Comment-to-DM Automation" that helps Shopify merchants convert Instagram comment engagement into direct sales. When a customer leaves a comment on an Instagram post that has been mapped to a Shopify product, our app receives the comment via webhook, uses AI to analyze the comment's intent (such as purchase intent, product questions, or size inquiries), and if the comment meets our confidence threshold and automation rules, automatically sends a private direct message to that customer with a relevant product page link or checkout link. This permission is essential because it allows us to read comments on Instagram posts where the merchant's account is tagged or mentioned, identify which specific post the comment is on (via the media ID), map that post to the corresponding Shopify product that the merchant has configured, and then send a personalized DM response with the appropriate product link. The value this provides to merchants is significant: it transforms passive comment engagement into active sales opportunities by automatically responding to customer inquiries with direct purchase links, reducing the manual work required to respond to every comment while ensuring customers receive timely, relevant product information. This permission is necessary for app functionality because without it, we cannot receive comment webhooks from Instagram, cannot identify which post a comment belongs to (which is required to map comments to products), and therefore cannot provide the Comment-to-DM automation feature that is a core differentiator of our app. Our app strictly adheres to Meta's policies: we only respond to user-initiated comments (never send unsolicited messages), we respect the 24-hour messaging window, we only send DMs when there is clear purchase intent or product questions, and we include confidence thresholds to prevent inappropriate automated responses.

## Testing Instructions for App Reviewers

To test the Comment-to-DM automation feature, please follow these steps:

**Step 1: Access the Shopify App**
1. Log into the Shopify test store Admin at `dmteststore-2.myshopify.com` using the provided staff account credentials.
2. Navigate to **Apps** → **DM Checkout AI** to open the embedded app.
3. Go to the **Instagram Feed** page (`/app/instagram-feed`) to verify that a product mapping exists for the test post.

**Step 2: Test Comment-to-DM Functionality**
1. Navigate to the Instagram post that has automation enabled. **Post URL**: [You will need to provide the actual Instagram post URL here, e.g., `https://www.instagram.com/p/ABC123xyz/`]
2. Leave a comment on this post using one of the following test phrases that indicate purchase intent:
   - "I want to buy this"
   - "How much does this cost?"
   - "I'd like to purchase this product"
   - "Can I buy this?"
   - "What sizes are available?"
   - "Do you have this in stock?"
3. Within a few moments, you should receive a private direct message from the Instagram business account with a product page link or checkout link.

**Step 3: Verify the Automation Worked**
1. Return to the Shopify app and navigate to the **Webhook Demo** page (`/app/webhook-demo`).
2. Scroll down to the **Recent Messages (Database)** section.
3. You should see your comment logged with:
   - The comment text you posted
   - AI-detected intent (should be "purchase", "product_question", "variant_inquiry", or "price_request")
   - AI confidence score (should be 0.70 or higher for automation to trigger)
   - The AI response that was sent via DM

**Alternative Testing Method (if real-time webhooks are not working in Development mode):**
1. In the Shopify app, go to the **Webhook Demo** page (`/app/webhook-demo`).
2. Select **Comment → DM** as the test type.
3. Choose a test scenario (e.g., "Purchase Intent").
4. Click **Send Test Webhook**.
5. Review the results in Step 2 and Step 3 on the page to see how the comment would be processed and what DM would be sent.

**Important Notes:**
- The app only responds to comments that show clear purchase intent or product questions (not generic comments like "nice!" or "cool").
- Comments must meet a confidence threshold of 0.70 for automation to trigger.
- The Instagram post must have a product mapping configured in the app (done via the Instagram Feed page).
- Comment automation must be enabled in the app's Automation Controls settings.

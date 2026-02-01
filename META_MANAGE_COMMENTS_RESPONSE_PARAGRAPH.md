# Meta App Review Response: instagram_business_manage_comments

## Main Response (Paragraph Form)

Our app, DM Checkout AI, uses the `instagram_business_manage_comments` permission to enable a critical feature called "Comment-to-DM Automation" that helps Shopify merchants convert Instagram comment engagement into direct sales. When a customer leaves a comment on an Instagram post that has been mapped to a Shopify product, our app receives the comment via webhook, uses AI to analyze the comment's intent (such as purchase intent, product questions, or size inquiries), and if the comment meets our confidence threshold and automation rules, automatically sends a private direct message to that customer with a relevant product page link or checkout link. This permission is essential because it allows us to read comments on Instagram posts where the merchant's account is tagged or mentioned, identify which specific post the comment is on (via the media ID), map that post to the corresponding Shopify product that the merchant has configured, and then send a personalized DM response with the appropriate product link. The value this provides to merchants is significant: it transforms passive comment engagement into active sales opportunities by automatically responding to customer inquiries with direct purchase links, reducing the manual work required to respond to every comment while ensuring customers receive timely, relevant product information. This permission is necessary for app functionality because without it, we cannot receive comment webhooks from Instagram, cannot identify which post a comment belongs to (which is required to map comments to products), and therefore cannot provide the Comment-to-DM automation feature that is a core differentiator of our app. Our app strictly adheres to Meta's policies: we only respond to user-initiated comments (never send unsolicited messages), we respect the 24-hour messaging window, we only send DMs when there is clear purchase intent or product questions, and we include confidence thresholds to prevent inappropriate automated responses.

## Testing Instructions

**Post Link for Testing:**
[You need to provide the actual Instagram post URL here, e.g., `https://www.instagram.com/p/ABC123xyz/`]

**Keywords/Phrases for Reviewers to Use:**
Please leave a comment on the post above using one of these phrases that indicate purchase intent:
- "I want to buy this"
- "How much does this cost?"
- "I'd like to purchase this product"
- "Can I buy this?"
- "What sizes are available?"
- "Do you have this in stock?"

**Additional Testing Instructions:**
1. After posting the comment, you should receive a private DM from the Instagram business account within a few moments.
2. To verify the automation worked, log into the Shopify test store (`dmteststore-2.myshopify.com`) and navigate to Apps → DM Checkout AI → Webhook Demo page.
3. Scroll to the "Recent Messages (Database)" section to see your comment logged with the AI-detected intent and the response that was sent.
4. Note: The app only responds to comments showing clear purchase intent (confidence threshold of 0.70 or higher). Generic comments like "nice!" or "cool" will not trigger automation.

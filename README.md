# SocialRepl.ai

Transform Instagram DMs and comments into sales with AI-powered automated responses and checkout links.

## Features

### Free Tier
- 25 automated DMs per month after a 14-day Growth demo
- DM automation with checkout links
- Comment-to-DM, multi-turn, and brand voice for the first 14 days after connecting Instagram
- Basic analytics (messages sent, CTR, top trigger phrases)

### Growth Tier ($39/mo, 7-day free trial)
- 1,000 automated messages per month
- Comment-to-DM always on
- Multi-turn conversations
- Brand voice customization
- Order attribution and full analytics

### Pro Tier ($99/mo, 30-day free trial)
- 10,000 automated messages per month
- All Growth features, plus:
- Story replies and a default product for unmapped posts
- Follow-up automation (23-24 hours after last message)
- Per-post analytics
- Priority support

## Getting Started

### 1. Install the App

1. Install the app from the Shopify App Store
2. Complete the OAuth flow to connect your Shopify store

### 2. Connect Instagram

1. Navigate to the **Home** page
2. Click **"Connect Instagram Business Account"**
3. You'll be redirected to Facebook to authorize the app
4. Grant permissions for your Facebook Page and Instagram Business account
5. You'll be redirected back to the app

**Requirements:**
- You need a Facebook Page
- Your Instagram account must be a Business account
- The Instagram account must be linked to your Facebook Page

### 3. Configure Automation

1. Go to the **Home** page
2. Under **Automation Controls** (Pro plan required):
   - Toggle **DM Automation** to enable/disable automatic DM responses
   - Toggle **Comment Automation** to enable/disable comment-to-DM replies
   - Toggle **Follow-Up Automation** to enable automatic follow-up messages (Pro only)
3. Configure **Brand Voice** (Growth/Pro plans):
   - Select tone: Friendly, Expert, or Casual
   - Add custom instructions (optional)
4. Click **"Save Settings"**

### 4. Map Products to Instagram Posts

1. Navigate to the **Instagram Feed** page
2. Browse your Instagram posts
3. For each post, click **"Map Product"**
4. Select a Shopify product
5. Optionally select a variant
6. Click **"Save Mapping"**
7. Toggle automation on/off for individual posts using the checkbox

### 5. View Analytics

1. Navigate to the **Analytics** page
2. View your metrics:
   - **Free**: Messages sent, CTR, top trigger phrases
   - **Growth**: All Free metrics + per-channel performance
   - **Pro**: All Growth metrics + customer segments, sentiment analysis, revenue attribution, follow-up performance

## How It Works

### DM Automation

1. Customer sends a DM to your Instagram account
2. AI classifies the message intent (purchase, product question, etc.)
3. If intent matches criteria and confidence is high:
   - System finds the product mapping for the conversation context
   - Generates a personalized reply using your brand voice
   - Sends a checkout link via DM
   - Tracks the link for attribution

### Comment Automation (Pro Only)

1. Customer comments on your Instagram post
2. AI classifies the comment intent
3. If intent matches criteria:
   - System finds the product mapping for that post
   - Sends a private DM reply with checkout link
   - Tracks the link for attribution

### Follow-Up Automation (Pro Only)

1. 23-24 hours after sending a checkout link, if:
   - No click was recorded
   - Follow-up hasn't been sent yet
   - Follow-up automation is enabled
2. System sends a polite follow-up message
3. Performance is tracked in analytics

### Order Attribution

When a customer clicks a checkout link and makes a purchase:
- The order is automatically attributed to the Instagram channel
- Revenue is tracked in analytics
- You can view attribution records in the Analytics page

## Troubleshooting

### Instagram Connection Issues

- **"Invalid redirect URI"**: Ensure your app URL is set correctly in Meta App settings
- **"Page access required"**: Make sure your Instagram account is linked to a Facebook Page
- **Token expired**: The app automatically refreshes tokens, but if issues persist, try disconnecting and reconnecting

### Automation Not Working

1. Check that automation is enabled in **Home** > **Automation Controls**
2. Verify your plan tier (some features require Growth/Pro)
3. Check that the specific post has automation enabled (Instagram Feed page)
4. Ensure product mapping exists for the post
5. Check usage limits (Free tier: 25/month)

### Analytics Not Showing Data

- Analytics require messages to be sent and links to be clicked
- Date range filters may exclude your data
- Ensure you're viewing the correct plan tier's analytics

## Support

For issues or questions:
1. Visit the **Support** page in the app
2. Check the troubleshooting section above
3. Contact support through the app

## Privacy & Compliance

- All messages are processed securely
- Customer data is stored in compliance with GDPR and CCPA
- Instagram/Facebook tokens are encrypted at rest
- The app follows Meta's messaging policies (24-hour rule, etc.)

## Rate Limits

- **OpenAI API**: Rate limited per shop to prevent abuse
- **Meta API**: Follows Meta's rate limits
- **Message Sending**: Conservative limits per shop to avoid flooding

## Technical Details

### Webhooks

The app subscribes to:
- Instagram message webhooks
- Instagram comment webhooks
- Shopify order webhooks (for attribution)

### Database

All data is stored in Supabase (PostgreSQL):
- Messages and comments
- Product mappings
- Attribution records
- Settings and brand voice
- Analytics data

### Security

- Row Level Security (RLS) enabled on all tables
- Service role key used for backend operations
- Tokens encrypted at rest
- Secure API communication (HTTPS only)


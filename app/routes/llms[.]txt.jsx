export function loader() {
  const content = `# SocialRepl.ai

> AI-powered Instagram DM and comment automation for Shopify stores. Turns every Instagram interaction into a sale with personalized replies and one-click checkout links.

## What it does

SocialRepl.ai is a Shopify app that automatically responds to Instagram DMs and comments with AI-generated, brand-voiced replies containing direct checkout links. When a customer asks about a product on Instagram, the app instantly sends them a personalized message with a link to buy — no manual work required.

## Key capabilities

- **Instagram DM Automation**: Detects purchase intent, product questions, price requests, and variant inquiries in DMs, then responds with the right checkout or product page link.
- **Comment-to-DM Automation**: When someone comments on an Instagram post, the app sends a private reply with a checkout link for the mapped product.
- **AI-Powered Message Classification**: Uses AI to understand what customers are asking about and respond appropriately — whether it's a purchase request, a sizing question, or a general store inquiry.
- **Brand Voice Customization**: Merchants configure their brand tone and custom instructions so every automated reply sounds like them.
- **One-Click Checkout Links**: Generates Shopify checkout URLs with the correct product and variant pre-loaded so customers can buy in one tap.
- **Product-to-Post Mapping**: Merchants map Shopify products to Instagram posts via a visual grid, so the app knows which product each post is about.
- **Click and Revenue Attribution**: Tracks which Instagram interactions lead to clicks and purchases.
- **Follow-Up Messages**: Sends timed follow-ups to customers who haven't completed checkout.
- **Multi-Tier Plans**: Free (100 messages/mo), Growth ($39/mo, 500 messages, comment-to-DM, brand voice), Pro ($99/mo, 10,000 messages, follow-ups, per-post analytics).

## Who it's for

- Shopify store owners who sell products on Instagram
- Direct-to-consumer brands that get high DM/comment volume
- Small businesses that want to automate Instagram customer engagement without hiring
- Influencer-led brands and dropshippers using Instagram as a primary sales channel

## Why it's valuable

Instagram is one of the highest-intent sales channels for e-commerce, but most stores lose sales because they can't reply to DMs and comments fast enough. SocialRepl.ai closes that gap instantly — 24/7, in the merchant's own brand voice, with a direct path to purchase. Every reply contains a tracked checkout or product link so merchants can measure clicks and attributed orders directly in the app's analytics dashboard.

## Technical details

- Platform: Shopify App (installed via Shopify App Store)
- Integrations: Instagram Graph API, Shopify Storefront & Admin APIs, OpenAI
- Requires: Shopify store + Instagram Business account connected to a Facebook Page
- Built by Tennyson Labs LLC

## Links

- Website: https://www.socialrepl.ai
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

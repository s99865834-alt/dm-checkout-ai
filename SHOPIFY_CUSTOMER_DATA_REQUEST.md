# Shopify Protected Customer Data Access Request - Justification

## App Name
DM-to-Buy

## Purpose of Customer Data Access

Our app requires access to protected customer data to provide order attribution and analytics functionality that helps merchants understand the ROI of their Instagram marketing efforts.

## Specific Data Needed

1. **Order Data** (via `orders/create` webhook):
   - Order ID
   - Order total/amount
   - Customer name and email (for attribution tracking)
   - Landing site and referring site URLs (to extract attribution parameters)

2. **Customer Information**:
   - Customer name (for attribution records)
   - Customer email (for analytics and reporting)

## How Data is Used

1. **Order Attribution Tracking**:
   - When a customer clicks a checkout link sent via Instagram DM or comment, we track the `link_id` in the URL
   - When an order is created, we parse the order's `landing_site` or `referring_site` to extract the `link_id`
   - We record attribution records linking orders to specific Instagram messages/comments
   - This allows merchants to see which Instagram interactions led to sales

2. **Analytics & Reporting**:
   - Merchants can view attribution records in the Analytics page
   - Filter by channel (DM vs Comment), order ID, date range
   - Understand which Instagram posts/messages drive the most revenue
   - Calculate ROI of Instagram marketing efforts

3. **Data Storage**:
   - Attribution records are stored in our Supabase database
   - We store: order_id, link_id, channel, amount, currency, created_at
   - Customer name/email may be referenced but are not stored in attribution records (only order_id is stored)
   - All data is encrypted at rest and transmitted over HTTPS

## Merchant Benefits

- **ROI Tracking**: Merchants can see exactly which Instagram messages/comments lead to sales
- **Performance Analytics**: Understand which channels (DM vs Comments) perform better
- **Optimization**: Make data-driven decisions about Instagram marketing strategy
- **Attribution**: Properly attribute revenue to Instagram marketing efforts

## Data Security & Privacy

- All data is stored in Supabase (PostgreSQL) with Row Level Security (RLS) enabled
- Data is encrypted at rest and in transit
- We only store minimal attribution data (order_id, link_id, channel, amount)
- Customer personal information (name/email) is only accessed from webhook payloads for attribution purposes and is not stored separately
- We comply with GDPR and other privacy regulations
- Merchants can view and filter their own attribution data only (shop-scoped)

## Technical Implementation

- We receive order data via Shopify's `orders/create` webhook
- Webhook payloads are authenticated using HMAC verification
- We parse URLs to extract attribution parameters (`link_id`, UTMs)
- Attribution records are created only when a valid `link_id` is found in the order's landing/referring site
- All processing happens server-side with proper error handling

## Data Minimization

We only access and store the minimum data necessary for attribution:
- Order ID (for linking to Shopify orders)
- Link ID (for linking to Instagram messages)
- Channel (DM or Comment)
- Amount and currency
- Timestamp

We do NOT store:
- Full customer profiles
- Payment information
- Shipping addresses
- Other sensitive customer data beyond what's necessary for attribution

---

## Request Summary

We request access to protected customer data to enable order attribution tracking that helps merchants understand the ROI of their Instagram marketing efforts. This is a core feature of our app that provides valuable analytics to merchants using Instagram for sales.




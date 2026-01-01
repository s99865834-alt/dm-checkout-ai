-- Upgrade shop to PRO plan
UPDATE shops
SET 
  plan = 'PRO',
  monthly_cap = 50000,
  priority_support = true
WHERE shopify_domain = 'dmteststore-2.myshopify.com';

-- Verify the update
SELECT id, shopify_domain, plan, monthly_cap, priority_support, active
FROM shops
WHERE shopify_domain = 'dmteststore-2.myshopify.com';



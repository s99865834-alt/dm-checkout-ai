-- Step 1: Check if the table exists and what columns it has
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'meta_auth'
ORDER BY ordinal_position;

-- Step 2: See what data is in the table (if any)
SELECT id, shop_id, page_id, ig_business_id, 
       CASE WHEN user_access_token IS NULL THEN 'NULL' 
            WHEN user_access_token = '' THEN 'EMPTY'
            ELSE 'HAS_TOKEN' END as user_token_status,
       CASE WHEN page_access_token IS NULL THEN 'NULL' 
            WHEN page_access_token = '' THEN 'EMPTY'
            ELSE 'HAS_TOKEN' END as page_token_status,
       token_expires_at,
       created_at,
       updated_at
FROM meta_auth;


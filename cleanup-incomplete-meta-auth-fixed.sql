-- Clean up incomplete meta_auth records
-- Using the correct column names: user_token_enc, page_token_enc

-- First, let's see what we have:
SELECT COUNT(*) as total_records,
       COUNT(user_token_enc) as has_user_token,
       COUNT(page_token_enc) as has_page_token
FROM meta_auth;

-- Delete incomplete records
DELETE FROM meta_auth 
WHERE user_token_enc IS NULL 
   OR page_token_enc IS NULL
   OR LENGTH(TRIM(user_token_enc)) = 0
   OR LENGTH(TRIM(page_token_enc)) = 0;

-- Verify cleanup
SELECT COUNT(*) as remaining_records FROM meta_auth;


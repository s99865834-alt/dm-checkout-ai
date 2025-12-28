-- First, check the actual table structure
-- Run this to see what columns exist:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'meta_auth';

-- Then, based on the actual columns, clean up incomplete records
-- If the columns are named differently, adjust the query below:

-- Option 1: If columns are named user_access_token and page_access_token
DELETE FROM meta_auth 
WHERE user_access_token IS NULL 
   OR page_access_token IS NULL
   OR user_access_token = ''
   OR page_access_token = '';

-- Option 2: If you see different column names from the SELECT above,
-- use those names instead. For example, if they're named differently,
-- you might need to check if the table exists and what it contains:
-- SELECT * FROM meta_auth LIMIT 1;


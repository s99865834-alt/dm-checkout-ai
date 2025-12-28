-- Delete the test/dummy meta_auth record
-- This will remove the test data so you can connect with real Instagram account

DELETE FROM meta_auth 
WHERE page_id = 'test_page_123' 
   OR ig_business_id = 'test_ig_123';

-- Verify it's deleted
SELECT COUNT(*) as remaining_records FROM meta_auth;


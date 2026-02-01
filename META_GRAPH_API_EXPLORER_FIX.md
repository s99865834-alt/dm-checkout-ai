# Fixing Graph API Explorer Error for Instagram API Calls

## Error: "Invalid OAuth access token - Cannot parse access token"

This error occurs when trying to use Graph API Explorer for Instagram endpoints. Here's how to fix it:

## Step-by-Step Fix

### 1. Select the Correct User/Page
- In Graph API Explorer, click the dropdown next to "User or Page"
- Select your **Facebook Page** (not your personal Facebook account)
- The Page must have an Instagram Business account linked to it

### 2. Add Instagram Permissions
- Click "Add Permissions" or the permissions dropdown
- Add these permissions:
  - `instagram_basic`
  - `instagram_manage_comments` (if testing comments)
  - `instagram_manage_messages` (if testing messages)
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_metadata`
- Click "Generate Access Token"
- **Important:** Grant all permissions when Meta asks

### 3. Get Your Instagram Business Account ID
First, you need to find your Instagram Business Account ID:

**Method 1: Via Page Info**
```
GET /{page-id}?fields=instagram_business_account
```
Replace `{page-id}` with your Facebook Page ID. This returns:
```json
{
  "instagram_business_account": {
    "id": "17841478724885002"
  }
}
```

**Method 2: Via Your App**
- Log into your Shopify app
- Go to Home page
- The Instagram Business Account ID should be displayed

### 4. Use the Correct Endpoint Format
For Instagram API calls, use the **Instagram Business Account ID**, not the Page ID:

**Correct:**
```
GET /17841478724885002/media
GET /17841478724885002/comments
```

**Wrong:**
```
GET /{page-id}/media  ❌ (This won't work)
```

### 5. Verify Token Type
- The token should be a **Page Access Token**, not a User Access Token
- In Graph API Explorer, make sure you selected your Page (not your personal account)
- The token should show permissions including `instagram_basic`

## Common Issues and Solutions

### Issue 1: Token Doesn't Have Instagram Permissions
**Solution:** 
- Remove the token
- Re-add all Instagram permissions
- Generate a new token
- Make sure to grant permissions when Meta prompts you

### Issue 2: Using Wrong ID
**Solution:**
- Use Instagram Business Account ID (starts with numbers, e.g., `17841478724885002`)
- NOT Facebook Page ID
- Get it via: `GET /{page-id}?fields=instagram_business_account`

### Issue 3: Token Expired
**Solution:**
- Generate a new access token in Graph API Explorer
- Page tokens typically last 60 days
- For testing, short-lived tokens work fine

### Issue 4: Page Not Linked to Instagram
**Solution:**
- Go to Facebook Page Settings → Instagram
- Make sure Instagram Business account is linked
- The Instagram account must be a Business account (not Personal)

## Testing API Calls

### Test 1: Get Instagram Account Info
```
GET /{ig-business-id}?fields=username,media_count,profile_picture_url
```

### Test 2: Get Instagram Posts
```
GET /{ig-business-id}/media?fields=id,caption,media_type,permalink
```

### Test 3: Read Comments on a Post
```
GET /{media-id}/comments?fields=id,text,timestamp,from
```
(First get a media-id from Test 2)

### Test 4: Get Comment Details
```
GET /{comment-id}?fields=id,text,timestamp,from
```

## Alternative: Use Your App's Test Endpoint

If Graph API Explorer continues to have issues, you can test via your app:

1. Log into your Shopify app
2. Go to Webhook Demo page
3. Use the test webhook functionality
4. Or use the test endpoint: `POST https://dm-checkout-ai-production.up.railway.app/meta/test-webhook`

## Quick Checklist

- [ ] Selected Facebook Page (not personal account) in Graph API Explorer
- [ ] Added `instagram_basic` permission
- [ ] Added `instagram_manage_comments` permission (for comments testing)
- [ ] Generated new access token after adding permissions
- [ ] Using Instagram Business Account ID (not Page ID) in endpoints
- [ ] Instagram Business account is linked to the Facebook Page
- [ ] Instagram account is a Business account (not Personal)

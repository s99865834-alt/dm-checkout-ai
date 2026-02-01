# Fixing "Invalid platform app" Error

## Error: "Invalid Request: Request parameters are invalid: Invalid platform app"

This error means Meta doesn't recognize your app for the platform you're trying to use (Instagram). Here's how to fix it:

## Step 1: Verify App Platform Configuration

### In Meta App Dashboard:

1. **Go to App Dashboard** → Your App
2. **Settings** → **Basic**
3. **Add Platform** → Make sure **Website** is added
4. **App Domains** should include:
   - `dm-checkout-ai-production.up.railway.app`
   - `railway.app` (if needed)

### For Instagram API Access:

1. **Products** → **Instagram** → Make sure it's **added**
2. **Products** → **Instagram** → **Settings**:
   - **Valid OAuth Redirect URIs** should include:
     - `https://dm-checkout-ai-production.up.railway.app/meta/instagram/callback`
   - **Deauthorize Callback URL**:
     - `https://dm-checkout-ai-production.up.railway.app/meta/data-deletion`
   - **Data Deletion Request URL**:
     - `https://dm-checkout-ai-production.up.railway.app/meta/data-deletion`

## Step 2: Add Test Users/Pages

### For Development Mode Testing:

1. **Roles** → **Roles** → **Test Users** or **Testers**
2. **Add Test Users**:
   - Add your Facebook account as a tester
   - Add your Facebook Page as a tester
3. **Roles** → **Instagram Testers**:
   - Add your Instagram Business account

### Alternative: Use Your Own Account

If you're the app owner:
- You can use your own account without adding as tester
- Make sure you're logged into Meta with the account that owns the app

## Step 3: Verify Permissions Are Requested

1. **App Review** → **Permissions and Features**
2. Make sure these permissions are **requested** (even if not approved yet):
   - `instagram_business_basic`
   - `instagram_business_manage_comments`
   - `instagram_business_manage_messages`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`

## Step 4: Check App ID Match

Make sure you're using the correct App ID:

1. **Settings** → **Basic** → Copy your **App ID**
2. Verify it matches your `.env` file:
   ```
   META_APP_ID=your-app-id-here
   ```
3. In Graph API Explorer, make sure you selected the correct app from the dropdown

## Step 5: Enable Instagram Product

1. **Products** → **Instagram** → **Set Up**
2. Make sure Instagram product is **configured**:
   - OAuth redirect URIs are set
   - Webhooks are configured (if needed)
   - Permissions are requested

## Step 6: For Graph API Explorer Specifically

### If using Graph API Explorer:

1. **Select the correct app** from the dropdown (top left)
2. **Select your Page** (not "Me" or personal account)
3. **Add permissions**:
   - Click "Add Permissions"
   - Add: `instagram_basic`, `pages_show_list`, etc.
   - Click "Generate Access Token"
4. **Grant permissions** when Meta asks

### Common Graph API Explorer Issues:

**Issue:** "Invalid platform app" when selecting a user/page
**Solution:** 
- Make sure the user/page is added as a tester
- Or use your own account (if you're the app owner)
- Make sure you selected the correct app from dropdown

**Issue:** "Invalid platform app" when making API calls
**Solution:**
- Verify the token was generated for the correct app
- Check that Instagram product is enabled
- Make sure you're using Page Access Token (not User Token)

## Step 7: Verify App Status

1. **App Review** → **App Review** → Check app status
2. If app is in **Development Mode**:
   - Only test users/pages can use it
   - Add yourself and your page as testers
3. If app is **In Review** or **Live**:
   - Should work for all users (if permissions approved)

## Step 8: Test with Your App's OAuth Flow

Instead of Graph API Explorer, test through your app:

1. Log into Shopify app
2. Go to Home page
3. Click "Connect Instagram Business Account"
4. Complete OAuth flow
5. This will generate proper tokens with all permissions

Then check the database or app logs to see the tokens that were generated.

## Quick Checklist

- [ ] Website platform is added in App Settings
- [ ] Instagram product is added and configured
- [ ] OAuth redirect URIs are set correctly
- [ ] Test users/pages are added (or using owner account)
- [ ] Permissions are requested in App Review
- [ ] App ID matches in .env and Graph API Explorer
- [ ] Using Page Access Token (not User Token)
- [ ] Selected correct app in Graph API Explorer dropdown

## Alternative: Use Your App's Test Endpoint

If Graph API Explorer continues to have issues, use your app's built-in testing:

1. **Webhook Demo page** in your Shopify app
2. **Test webhook endpoint**: `POST /meta/test-webhook`
3. These use your app's configured tokens automatically

## Still Having Issues?

Check:
1. **App Dashboard** → **Tools** → **Graph API Explorer** → Is your app listed?
2. **App Dashboard** → **Settings** → **Basic** → Is "Website" platform added?
3. **App Dashboard** → **Products** → Is "Instagram" product added?

If all are configured and you still get the error, it might be a Meta platform issue. Try:
- Waiting a few minutes (Meta sometimes has delays)
- Using a different browser/incognito mode
- Clearing browser cache
- Using your app's OAuth flow instead of Graph API Explorer

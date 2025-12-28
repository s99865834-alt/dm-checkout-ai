# Meta OAuth "Can't load URL" Troubleshooting Guide

## The Error
```
Can't load URL
The domain of this URL isn't included in the app's domains. 
To be able to load this URL, add all domains and subdomains of your app 
to the App Domains field in your app settings.
```

## Root Cause
Meta checks **both**:
1. The domain where the OAuth flow is initiated from
2. The redirect URI domain

## Step-by-Step Fix

### 1. Verify Your Redirect URI
Your redirect URI should be:
```
https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback
```

**Check the server logs** when you click "Connect Instagram" - you should see:
```
[oauth] Redirect URI: https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback?shop=...
```

### 2. Meta App Dashboard Settings

Go to: https://developers.facebook.com/apps/[YOUR_APP_ID]/settings/basic/

#### A. App Domains (Settings → Basic)
- **Field**: "App Domains"
- **Add**: `dm-checkout-ai-production.up.railway.app`
- **Important**: 
  - NO `https://` prefix
  - NO trailing slash
  - Just the domain: `dm-checkout-ai-production.up.railway.app`

#### B. Website URL (Settings → Basic)
- **Field**: "Website URL"
- **Set to**: `https://dm-checkout-ai-production.up.railway.app`
- **Important**: Include `https://` here

#### C. Valid OAuth Redirect URIs (Settings → Basic → Facebook Login → Settings)
- **Navigate to**: Settings → Basic → Scroll down to "Facebook Login" → Click "Settings"
- **Or direct link**: https://developers.facebook.com/apps/[YOUR_APP_ID]/fblogin/settings/
- **Add**: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback`
- **Important**: 
  - Include `https://`
  - Include the full path: `/auth/instagram/callback`
  - NO query parameters (Meta will match the base URL)

#### D. Privacy Policy URL (Settings → Basic)
- **Required**: Meta requires a Privacy Policy URL for OAuth
- **Add**: Any valid URL (can be a placeholder for now)
- **Example**: `https://dm-checkout-ai-production.up.railway.app/privacy`

### 3. Verify App ID and Secret

**In Railway Environment Variables:**
- `META_APP_ID` should match your App ID from Meta Dashboard
- `META_APP_SECRET` should match your App Secret from Meta Dashboard

**To verify:**
1. Go to Meta App Dashboard → Settings → Basic
2. Check "App ID" matches `META_APP_ID` in Railway
3. Click "Show" next to "App Secret" and verify it matches `META_APP_SECRET` in Railway

### 4. Check App Status

**In Meta App Dashboard:**
- Go to Settings → Basic
- Check "App Mode" - should be "Development" or "Live"
- If in Development mode, make sure you're logged in as a test user or the app admin

### 5. Common Issues

#### Issue: Domain Mismatch
**Symptom**: Error persists after adding domains
**Fix**: 
- Check for typos in domain name
- Ensure no trailing slashes
- Verify HTTPS (not HTTP)

#### Issue: Redirect URI Not Matching
**Symptom**: OAuth redirects but fails
**Fix**:
- The redirect URI in "Valid OAuth Redirect URIs" must **exactly match** what's in your code
- Check server logs to see the exact redirect URI being used
- Meta matches the base URL, so `https://domain.com/callback?param=value` matches `https://domain.com/callback`

#### Issue: App Not in Development Mode
**Symptom**: OAuth works but shows "App Not Available"
**Fix**:
- Add yourself as a test user in App Dashboard → Roles → Test Users
- Or switch app to "Live" mode (requires App Review)

### 6. Testing Steps

1. **Check Server Logs**:
   - Click "Connect Instagram" button
   - Check Railway logs for `[oauth]` messages
   - Verify the redirect URI matches what's in Meta Dashboard

2. **Check Browser Network Tab**:
   - Open Developer Tools (F12)
   - Go to Network tab
   - Click "Connect Instagram"
   - Find the request to `facebook.com/dialog/oauth`
   - Check the `redirect_uri` parameter
   - Verify it matches your Meta Dashboard settings

3. **Test Direct URL**:
   - Try accessing: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback`
   - Should redirect (not show domain error)

### 7. Still Not Working?

If the error persists after checking all above:

1. **Clear Meta App Cache**:
   - Wait 5-10 minutes after making changes (Meta caches settings)
   - Try in an incognito/private browser window

2. **Verify Railway Environment Variables**:
   ```bash
   # Check what Railway is using
   echo $SHOPIFY_APP_URL
   echo $META_APP_ID
   ```

3. **Check for Multiple Domains**:
   - If you have multiple redirect URIs, ensure the one being used is listed
   - Meta checks ALL redirect URIs, so make sure there are no typos

4. **Contact Meta Support**:
   - If all else fails, the issue might be on Meta's side
   - Check Meta Developer Community forums

## Quick Checklist

- [ ] App Domains includes: `dm-checkout-ai-production.up.railway.app` (no https://)
- [ ] Website URL is: `https://dm-checkout-ai-production.up.railway.app` (with https://)
- [ ] Valid OAuth Redirect URIs includes: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback`
- [ ] Privacy Policy URL is set (required)
- [ ] META_APP_ID in Railway matches Meta Dashboard
- [ ] META_APP_SECRET in Railway matches Meta Dashboard
- [ ] Server logs show correct redirect URI
- [ ] Waited 5-10 minutes after making changes (cache)

## Expected Redirect URI Format

Your code generates:
```
https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback?shop=example.myshopify.com
```

Meta will match:
```
https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback
```

So make sure that exact URL (without query params) is in "Valid OAuth Redirect URIs".


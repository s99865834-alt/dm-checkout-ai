# Meta OAuth Redirect URI Fix

## Problem
Getting "URL Blocked" error even though the redirect URI appears correct in the OAuth request.

## Root Cause
Meta's "Valid OAuth Redirect URIs" must match **exactly** what's sent in the OAuth request. If your redirect URI includes query parameters (like `?shop=...`), Meta might reject it.

## Solution Options

### Option 1: Use Base URI Without Query Parameters (Recommended)
1. In Meta App Dashboard → Settings → Basic → Facebook Login → Settings
2. Add **only** the base URI without query parameters:
   ```
   https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback
   ```
3. Meta should accept this base URI and allow query parameters to be appended automatically.

### Option 2: Use Exact URI With Query Parameters
If Option 1 doesn't work, try adding the exact URI with query parameters:
```
https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback?shop=*
```
(Some Meta apps support wildcards, but this is not guaranteed)

### Option 3: Use State Parameter Instead (Best Practice)
Use the OAuth `state` parameter to pass the shop domain instead of query parameters in the redirect URI. This is the standard OAuth pattern and avoids redirect URI matching issues.

## Verification Checklist

Before testing, verify:

1. **App Domains** (Settings → Basic):
   - `dm-checkout-ai-production.up.railway.app` is listed

2. **Website URL** (Settings → Basic):
   - Set to: `https://dm-checkout-ai-production.up.railway.app`

3. **Valid OAuth Redirect URIs** (Settings → Basic → Facebook Login → Settings):
   - `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback`
   - (Without query parameters)

4. **Client OAuth Login** (Settings → Basic → Facebook Login → Settings):
   - Toggle is **ON** (green/blue)

5. **Web OAuth Login** (Settings → Basic → Facebook Login → Settings):
   - Toggle is **ON** (green/blue)

6. **App ID and Secret**:
   - Verify `META_APP_ID` and `META_APP_SECRET` in Railway match your Meta App Dashboard

## Testing

After updating the redirect URI in Meta:
1. Wait 1-2 minutes for changes to propagate
2. Clear browser cache or use incognito mode
3. Try the OAuth flow again

## If Still Not Working

1. Check server logs for the exact redirect URI being sent
2. Verify the redirect URI in the OAuth URL matches exactly what's in Meta Dashboard
3. Try removing and re-adding the redirect URI in Meta Dashboard
4. Check if your app is in "Development Mode" - some OAuth features may be restricted


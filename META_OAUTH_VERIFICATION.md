# Meta OAuth Redirect URI Verification

## Current Redirect URI Being Sent
```
https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback?shop=dmteststore-2.myshopify.com
```

## Meta Dashboard Settings Checklist

### Step 1: Verify Facebook Login Settings
Go to: https://developers.facebook.com/apps/1338416444696549/fblogin/settings/

**Required Settings:**
- ✅ **Client OAuth Login**: Must be **ON** (toggle enabled)
- ✅ **Web OAuth Login**: Must be **ON** (toggle enabled)
- ✅ **Enforce HTTPS**: Should be **ON**

### Step 2: Verify Valid OAuth Redirect URIs
In the same page (Facebook Login → Settings), find **"Valid OAuth Redirect URIs"**

**Add exactly this (NO query parameters):**
```
https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback
```

**Important:**
- Include `https://`
- Include the full path: `/auth/instagram/callback`
- NO trailing slash
- NO query parameters (Meta matches base URL)

### Step 3: Verify App Domains
Go to: https://developers.facebook.com/apps/1338416444696549/settings/basic/

Find **"App Domains"** field and add:
```
dm-checkout-ai-production.up.railway.app
```

**Important:**
- NO `https://`
- NO trailing slash
- Just the domain name

### Step 4: Verify Website URL
In the same Basic Settings page, find **"Website URL"** and set to:
```
https://dm-checkout-ai-production.up.railway.app
```

### Step 5: Save and Wait
1. Click **"Save Changes"** after adding redirect URI
2. **Wait 5-10 minutes** for Meta's cache to update
3. Try again in an **incognito/private browser window**

## Common Issues

### Issue: Settings Not Saving
- Make sure you click "Save Changes" button
- Check if you have the correct permissions (App Admin)
- Try refreshing the page and checking again

### Issue: Still Getting "URL Blocked" After Settings
1. **Double-check the exact URL format:**
   - Should be: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback`
   - NOT: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback/` (trailing slash)
   - NOT: `dm-checkout-ai-production.up.railway.app/auth/instagram/callback` (missing https://)

2. **Verify Client/Web OAuth Login are ON:**
   - Go to Facebook Login → Settings
   - Make sure both toggles are enabled (green/blue)
   - If they're gray/off, click to enable them

3. **Check for Typos:**
   - `railway.app` not `railway.com`
   - `dm-checkout-ai-production` (with hyphens)
   - `/auth/instagram/callback` (exact path)

4. **Try Removing and Re-adding:**
   - Remove the redirect URI from the list
   - Save changes
   - Wait 2 minutes
   - Add it back exactly: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback`
   - Save changes again

## Testing

After making changes:
1. Wait 5-10 minutes
2. Clear browser cache or use incognito mode
3. Try the OAuth flow again
4. Check browser console for any errors
5. Check server logs for `[oauth]` messages


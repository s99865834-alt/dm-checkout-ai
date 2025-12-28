# Fix: "URL Blocked - Redirect URI not whitelisted"

## The Error
```
URL Blocked
This redirect failed because the redirect URI is not whitelisted in the app's 
Client OAuth Settings. Make sure Client and Web OAuth Login are on and add all 
your app domains as Valid OAuth Redirect URIs.
```

## Step-by-Step Fix

### Step 1: Enable Client OAuth Login

1. Go to: https://developers.facebook.com/apps/1338416444696549/settings/basic/
2. Scroll down to find **"Facebook Login"** section
3. Click **"Settings"** next to "Facebook Login"
4. Or go directly to: https://developers.facebook.com/apps/1338416444696549/fblogin/settings/

5. **Enable these settings:**
   - ✅ **Client OAuth Login**: Toggle ON
   - ✅ **Web OAuth Login**: Toggle ON
   - ✅ **Enforce HTTPS**: Should be ON (required)

### Step 2: Add Valid OAuth Redirect URIs

In the same "Facebook Login" settings page:

1. Find **"Valid OAuth Redirect URIs"** field
2. Click **"Add URI"** or enter in the text field
3. Add exactly:
   ```
   https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback
   ```
4. **Important:**
   - Include `https://`
   - Include the full path: `/auth/instagram/callback`
   - NO trailing slash
   - NO query parameters (Meta matches base URL)

5. Click **"Save Changes"**

### Step 3: Verify App Domains

1. Go back to: https://developers.facebook.com/apps/1338416444696549/settings/basic/
2. Find **"App Domains"** field
3. Add: `dm-checkout-ai-production.up.railway.app`
   - NO `https://`
   - NO trailing slash
   - Just the domain name

### Step 4: Wait for Cache (IMPORTANT!)

Meta caches OAuth settings. After making changes:
- ⏰ **Wait 5-10 minutes** before testing again
- Or try in an **incognito/private browser window** (bypasses some cache)

### Step 5: Verify the Exact Redirect URI

Check your server logs (Railway) when you click "Connect Instagram". You should see:
```
[oauth] Redirect URI: https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback?shop=...
```

The part before `?shop=` must match exactly what you added in Step 2.

## Common Mistakes

❌ **Wrong**: `dm-checkout-ai-production.up.railway.app/auth/instagram/callback` (missing https://)
❌ **Wrong**: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback/` (trailing slash)
❌ **Wrong**: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback?shop=example` (query params)
✅ **Correct**: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback`

## Still Not Working?

### Check 1: Verify Settings Are Saved
- Go back to Facebook Login settings
- Verify "Client OAuth Login" and "Web OAuth Login" are still ON
- Verify your redirect URI is still in the list

### Check 2: Check Server Logs
- Look at Railway logs when clicking "Connect Instagram"
- Find the `[oauth] Redirect URI:` log line
- Copy the exact URL (without query params)
- Verify it matches what's in Meta Dashboard

### Check 3: Try Different Browser
- Clear browser cache
- Try incognito/private window
- Try a different browser

### Check 4: Verify App ID
- Make sure `META_APP_ID` in Railway matches your App ID
- Your App ID: `1338416444696549`
- Check: https://developers.facebook.com/apps/1338416444696549/settings/basic/

### Check 5: App Status
- Make sure your app is in "Development" or "Live" mode
- If in Development mode, you must be logged in as a test user or app admin

## Quick Checklist

- [ ] Client OAuth Login: **ON**
- [ ] Web OAuth Login: **ON**
- [ ] Valid OAuth Redirect URIs includes: `https://dm-checkout-ai-production.up.railway.app/auth/instagram/callback`
- [ ] App Domains includes: `dm-checkout-ai-production.up.railway.app` (no https://)
- [ ] Clicked "Save Changes" after adding redirect URI
- [ ] Waited 5-10 minutes after making changes
- [ ] Verified redirect URI in server logs matches Meta Dashboard
- [ ] Tried in incognito/private browser window


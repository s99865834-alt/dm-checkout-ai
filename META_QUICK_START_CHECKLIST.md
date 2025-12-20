# Meta App Quick Start Checklist

**Goal:** Get your Meta app set up so you can test API calls (Week 6)

## Current Status
- ✅ Meta app created
- ✅ Instagram API use case selected
- ✅ Facebook Business Page created (optional, but helpful for testing)

---

## Step-by-Step: What to Do Now

### Step 1: Add Required Permissions ✅

In **App Admin → Use Cases → Instagram API → Permissions and Features**, add these:

1. ✅ `instagram_business_basic` - Already have it
2. ✅ `instagram_manage_comments` - Already have it  
3. ✅ `instagram_business_manage_messages` - Already have it
4. ✅ `pages_show_list` - Already have it
5. ⚠️ **ADD:** `pages_manage_metadata` - **You need to add this!**

**How to add:**
- Go to **App Review → Permissions and Features**
- Search for `pages_manage_metadata`
- Click "Add" or "Request"
- Status will show "Ready for testing" (you can test in Development mode)

---

### Step 2: Get Your App Credentials ✅

In **App Admin → Use Cases → Instagram API**, you should see:

- **Instagram App ID:** `756843997385446` (you already have this)
- **Instagram App Secret:** Click "Show" to reveal it

**Save these in your `.env` file:**
```bash
META_APP_ID=756843997385446
META_APP_SECRET=your_app_secret_here
```

---

### Step 3: Configure Webhooks (For Week 6 Testing)

In **App Admin → Use Cases → Instagram API → Step 3: Configure webhooks**:

1. **Generate a verify token:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy the output.

2. **Add to your `.env` file:**
   ```bash
   META_WEBHOOK_VERIFY_TOKEN=your_generated_token_here
   ```

3. **In Meta Dashboard:**
   - **Callback URL:** `https://your-app.up.railway.app/webhooks/meta`
     - Replace with your actual Railway domain (or use `localhost` for local testing)
   - **Verify token:** Paste the token you generated
   - Click "Save"

**Note:** Webhooks won't verify until your app is published, but you can configure them now.

---

### Step 4: Set Up OAuth Redirect URIs (Optional - Can Skip for Now)

**This step is optional for Week 6 testing. You'll need it in Week 7 for OAuth flow.**

**Where to find it (if it exists):**
1. Go to **Settings → Basic** in Meta App Dashboard (left sidebar)
2. Look for **"Valid OAuth Redirect URIs"** or **"Instagram Business Login"** section
3. OR check **App Admin → Use Cases → Instagram API → Step 4: Set up Instagram Business Login**

**If you can't find it:**
- **That's OK!** You can skip this for now
- OAuth redirect URIs are only needed when you build the OAuth flow in Week 7
- For Week 6 testing, you don't need this yet

**What to add (when you find it):**
```
https://your-app.up.railway.app/auth/instagram/callback
https://your-app.up.railway.app/api/auth/instagram/callback
```
(Replace with your actual domain)

**For local testing:**
```
http://localhost:3000/auth/instagram/callback
```

---

### Step 5: Add Test Users/Pages (Optional - Can Skip for Now)

**This is optional for Week 6. You can test API calls without adding test users first.**

**Do you need a Facebook Business Page?**
- **For testing:** Yes, it's helpful but not strictly required
- **For production:** Merchants will use their own Pages
- **For now:** You can use your own Page for testing

**To add a test Instagram account:**

1. Go to **Roles → Roles** in Meta App Dashboard
2. Click **"Add People"** or **"Add Instagram Testers"**
3. Add your Instagram Business account (the one linked to your Facebook Page)
4. Set role to **"Instagram Tester"** or **"Developer"**

**To link Instagram to your Facebook Page:**
1. Go to your Facebook Page → Settings → Instagram
2. Connect your Instagram Business account
3. This gives you an Instagram Business account to test with

---

### Step 6: Test API Access (Week 6 Goal)

**You can test API calls in Development mode without app review!**

1. **Get a test access token:**
   - Go to **App Admin → Use Cases → Instagram API → Step 2: Generate access tokens**
   - Click "Add Instagram Account"
   - Select your test Instagram Business account
   - This generates a short-lived access token (expires in ~1 hour)

2. **Test a simple API call:**
   ```bash
   # Replace YOUR_ACCESS_TOKEN with the token from step 1
   curl "https://graph.facebook.com/v21.0/YOUR_IG_BUSINESS_ID?fields=username,profile_picture_url&access_token=YOUR_ACCESS_TOKEN"
   ```

3. **Or test in your code:**
   ```javascript
   // Test endpoint in your app
   const response = await fetch(
     `https://graph.facebook.com/v21.0/${igBusinessId}?fields=username&access_token=${accessToken}`
   );
   const data = await response.json();
   console.log(data);
   ```

---

### Step 8: Implement Webhook Endpoint (Week 6)

Create `app/routes/webhooks.meta.jsx`:

```javascript
import crypto from "crypto";

// Polyfill crypto
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}

const META_WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

// GET endpoint for webhook verification
export async function loader({ request }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === META_WEBHOOK_VERIFY_TOKEN) {
    console.log("[webhook] Meta webhook verified");
    return new Response(challenge, { status: 200 });
  }

  console.error("[webhook] Meta webhook verification failed");
  return new Response("Forbidden", { status: 403 });
}

// POST endpoint for webhook events
export async function action({ request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await request.text();
    const data = JSON.parse(body);
    console.log("[webhook] Meta webhook received:", JSON.stringify(data, null, 2));

    // TODO: Process webhook data (Week 8)
    
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[webhook] Error processing Meta webhook:", error);
    return new Response("Error", { status: 500 });
  }
}
```

---

### Step 9: Test Webhook Verification

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **Test webhook verification endpoint:**
   ```bash
   # Replace with your actual values
   curl "http://localhost:3000/webhooks/meta?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
   ```

3. **Expected response:** `test123` (the challenge value)

---

## What You Can Do NOW (Without App Review)

✅ **Test API calls** using short-lived tokens from Meta Dashboard
✅ **Implement webhook endpoints** in your code
✅ **Test webhook verification** locally
✅ **Build OAuth flow** (Week 7) - will work in Development mode
✅ **Test with your own Instagram account** (as a tester)

## What Requires App Review (Later)

❌ **Access live data from other users' accounts** (requires review)
❌ **Webhooks to work in production** (requires published app)
❌ **Merchants to connect their accounts** (requires review for production)

---

## Quick Checklist

- [ ] Added `pages_manage_metadata` permission
- [ ] Saved `META_APP_ID` and `META_APP_SECRET` in `.env`
- [ ] Generated and saved `META_WEBHOOK_VERIFY_TOKEN` in `.env`
- [ ] Configured webhook callback URL in Meta Dashboard (Instagram API → Step 3)
- [ ] (Optional) Added OAuth redirect URIs - can skip for now, do in Week 7
- [ ] (Optional) Added your Instagram account as a tester - can skip for now
- [ ] Created `app/routes/webhooks.meta.jsx` file
- [ ] Tested webhook verification endpoint
- [ ] Tested a simple API call with test token (from Instagram API → Step 2)

---

## Next Steps After This

1. **Week 6:** Continue with webhook implementation and testing
2. **Week 7:** Build OAuth flow to connect merchant Instagram accounts
3. **Week 8:** Process webhook events (comments and DMs)
4. **Before Launch:** Submit app for review to go live

---

## Common Questions

**Q: Do I need a Facebook Business Page?**
A: For testing, yes it's helpful. For production, merchants use their own Pages.

**Q: Can I test without app review?**
A: Yes! You can test with your own account in Development mode.

**Q: When do I need app review?**
A: Only when you want merchants (other users) to connect their accounts in production.

**Q: Why can't I verify webhooks?**
A: Webhooks only verify when app is published. Configure them now, verify later.

---

## Need Help?

If you're stuck on any step, check:
1. `META_APP_SETUP_GUIDE.md` for detailed instructions
2. Meta Developer Docs: https://developers.facebook.com/docs/instagram-api
3. Your `.env` file has all required variables


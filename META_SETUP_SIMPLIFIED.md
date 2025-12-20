# Meta App Setup - Simplified (What You Can Do NOW)

**Goal:** Get to the point where you can test API calls (Week 6)

## ✅ What You've Already Done
- Created Meta app
- Selected Instagram API use case
- Created Facebook Business Page (good for testing)

---

## What to Do RIGHT NOW (In Order)

### Step 1: Add Missing Permission ⚠️ REQUIRED

1. Go to **App Review → Permissions and Features** (left sidebar)
2. Search for `pages_manage_metadata`
3. Click "Add" or "Request"
4. Status will show "Ready for testing"

**Why:** You need this for the OAuth flow to work (Week 7)

---

### Step 2: Save Your Credentials ✅ REQUIRED

In **App Admin → Use Cases → Instagram API**, you see:
- **Instagram App ID:** `756843997385446`
- **Instagram App Secret:** Click "Show" to reveal

**Add to your `.env` file:**
```bash
META_APP_ID=756843997385446
META_APP_SECRET=your_secret_here
```

---

### Step 3: Generate Webhook Token ✅ REQUIRED

Run this command:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and add to `.env`:
```bash
META_WEBHOOK_VERIFY_TOKEN=your_generated_token_here
```

---

### Step 4: Configure Webhooks ✅ REQUIRED

In **App Admin → Use Cases → Instagram API → Step 3: Configure webhooks**:

1. **Callback URL:** 
   - For production: `https://your-app.up.railway.app/webhooks/meta`
   - For local testing: `http://localhost:3000/webhooks/meta` (if using localhost)
   - Replace with your actual domain

2. **Verify token:** Paste the token from Step 3

3. Click "Save"

**Note:** It won't verify until app is published, but configure it now.

---

### Step 5: Test API Access (Skip for Now - Do in Week 7)

**You can skip this step for now!**

Token generation requires 2FA setup. Instead:
- ✅ Focus on webhook setup (Step 6 below)
- ✅ Build OAuth flow in Week 7 (will get tokens programmatically)
- ✅ Test API calls in Week 7 after OAuth is working

**For now, you have everything you need for Week 6:**
- ✅ Permissions added
- ✅ Credentials saved
- ✅ Webhook configured
- ✅ Webhook endpoint ready to implement

---

### Step 6: Create Webhook Endpoint (Week 6 Task)

Create `app/routes/webhooks.meta.jsx`:

```javascript
import crypto from "crypto";

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}

const META_WEBHOOK_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

// GET - Webhook verification
export async function loader({ request }) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === META_WEBHOOK_VERIFY_TOKEN) {
    console.log("[webhook] Meta webhook verified");
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

// POST - Webhook events
export async function action({ request }) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await request.text();
    const data = JSON.parse(body);
    console.log("[webhook] Meta webhook received:", JSON.stringify(data, null, 2));
    
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[webhook] Error:", error);
    return new Response("Error", { status: 500 });
  }
}
```

---

## What You Can SKIP For Now

❌ **OAuth Redirect URIs** - Not needed until Week 7
❌ **Adding test users via Roles** - Can add directly in Step 2
❌ **App Review** - Not needed for testing your own account

---

## Quick Test Checklist (Week 6)

- [ ] Added `pages_manage_metadata` permission
- [ ] Saved `META_APP_ID` and `META_APP_SECRET` in `.env`
- [ ] Generated and saved `META_WEBHOOK_VERIFY_TOKEN` in `.env`
- [ ] Configured webhook in Meta Dashboard (Step 3)
- [ ] Set up Instagram Business Login redirect URL (Step 4)
- [ ] Created `app/routes/webhooks.meta.jsx` file
- [ ] Tested webhook verification endpoint
- ⏭️ **Week 7:** Build OAuth flow (will get tokens then)
- ⏭️ **Week 7:** Test API calls after OAuth works

---

## If You Can't Find Something

**"Roles" not visible?**
- Skip it. Add testers directly in Step 2 when generating tokens.

**"OAuth Redirect URIs" not visible?**
- Skip it. You'll configure this in Week 7 when building OAuth flow.

**"Settings → Basic" not showing what you need?**
- That's OK. Most settings are in the Instagram API use case section.

---

## Next Steps After This Works

1. ✅ You can test API calls (Week 6 goal achieved!)
2. ✅ You can test webhook verification
3. ⏭️ Week 7: Build OAuth flow (then you'll need redirect URIs)
4. ⏭️ Week 8: Process webhook events
5. ⏭️ Before launch: Submit for app review

---

## Need Help?

**If you need to test API calls before Week 7:**
- Set up 2FA on your Facebook account
- Use Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Or wait until Week 7 when OAuth flow will generate tokens automatically

**For Week 6, focus on:**
- Webhook setup and verification ✅
- Building webhook endpoint ✅
- Testing webhook verification ✅


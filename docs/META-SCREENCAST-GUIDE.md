# Meta App Review – Screencast Guide

Meta rejected the submission because the screencast did not clearly show:
1. **Asset selection** – Page, account, or number visible  
2. **A live send action from your app** – You sending a message from the app UI  
3. **The same message delivered in the native client** – That message visible in Instagram (or Messenger/WhatsApp)

Use the flow below so one recording shows all three.

---

## What to show (in one screencast)

### Part 1: Asset visible in your app (10–20 seconds)

1. **Open your app** (e.g. in Shopify Admin).
2. **Go to the Home/Dashboard** where the Instagram connection is shown.
3. **Make the connected asset clearly visible on screen:**
   - **Status: Connected**
   - **Username:** e.g. `@your_business_handle`
   - **Account ID:** (the IG Business Account ID)
   - Optionally: **Account type**, **Number of posts**

4. **Optional:** Add a short text annotation: “Connected Instagram Business account (asset).”

So reviewers see: “This app is using **this** Instagram account (asset).”

---

### Part 2: Live send from your app (30–60 seconds)

The “send” Meta cares about is: **your app sends a message via the API**, and that message is the one you’ll show in Instagram.

Your app sends messages when it **replies to an incoming DM** (automation). So you need one real incoming DM so the app can send one real reply.

**Option A – Real DM flow (recommended)**

1. Use **two accounts:**
   - **Account A:** Instagram Business account connected to your app (the “asset” from Part 1).
   - **Account B:** Personal or test account (the “customer”).

2. **On screen (desktop):** Stay in your app. Have the Webhook Demo page or the screen where you see “recent messages” / “Messages” open (so reviewers see it’s your app).

3. **From Account B (phone or second browser):**  
   Open **Instagram** → go to Account A’s profile → **Message** → send a short DM, e.g.  
   - “How much is this?” or  
   - “Do you ship to Canada?”

4. **Back in your app (desktop):**  
   - Wait a few seconds for the webhook to run and the automation to send the reply.  
   - Show the place in the app where it’s clear the app **sent** that reply, e.g.:  
     - **Webhook Demo:** “Webhook processed successfully!” and/or the “Would send” / “Sent” result, or  
     - **Analytics / Messages:** the conversation or row where the reply is shown as sent.

5. **Optional:** Add an annotation: “App sent automated reply via Messages API.”

So reviewers see: “User triggered an event (incoming DM), and the **app** performed a **send** (the reply).”

**Option B – Webhook Demo only (if you can’t show a real DM)**

If your “Send Test Webhook” actually results in an API send to a **real** Instagram user (e.g. a test user ID you control):

1. In the app, show **asset** (Part 1).
2. Open **Webhook Demo**, choose “Direct DM” (or “Comment → DM”), enter a test message.
3. Click **“Send Test Webhook”** and show the success state / “Would send” / “Sent” in the app.
4. Then show that **same** reply in the **native Instagram app** on the device that received it (Part 3).

If the test webhook sends to a **fake** user ID, that message will never appear in any real Instagram inbox, so Meta will not accept it. In that case you **must** use Option A (real DM from Account B).

---

### Part 3: Same message in the native client (20–30 seconds)

1. **On the device that received the reply** (Account B – the “customer”):
   - Open the **Instagram** app (native app, not browser).
   - Go to **DMs** → conversation with the business (Account A).

2. **Show the last message in the thread:**  
   The **reply your app sent** (e.g. “Hi! Thanks for your interest! Here’s the link…”) must be clearly visible as the latest message from the business.

3. **Optional:** Add an annotation: “Same message delivered in native Instagram.”

So reviewers see: “The message the app sent in Part 2 is **this** message here in Instagram.”

---

## Suggested screencast structure (single video)

| Order | What to record | Why |
|-------|----------------|-----|
| 1 | App open → Home → **Connected account (username + ID) visible** | (1) Asset selection |
| 2 | (Optional) Webhook Demo or Messages screen | Sets up “send” context |
| 3 | **Phone (or second device):** Account B sends a DM to the business | Triggers automation |
| 4 | **Back to app:** Show “Webhook processed” / “Sent” / message in Messages | (2) Live send from app |
| 5 | **Phone (or second device):** Instagram app → DMs → same reply visible | (3) Delivered in native client |

You can record desktop and phone in one take (e.g. phone in frame or picture-in-picture) or cut between desktop and phone; what matters is that all three elements are clearly visible in one submission video.

---

## Meta’s exact wording (for reference)

- “(1) asset selection (Page, account, or number visible)”  
  → You satisfy this by showing the connected Instagram account (and optionally Account ID) in your app.
- “(2) a live send action from your app”  
  → You satisfy this by showing the app sending the reply (after the real DM from Account B, or after a test webhook that really sends to a real user).
- “(3) the delivered message in the native client”  
  → You satisfy this by showing that **exact** reply in the Instagram app on the recipient’s device.

---

## Checklist before you submit

- [ ] Video shows the **connected Instagram account** (username and/or ID) in the app.
- [ ] Video shows a **send** triggered from your app (automated reply after a real DM, or test webhook that sends to a real user).
- [ ] Video shows the **same sent message** in the **native Instagram app** (DMs with the business).
- [ ] UI language is English (or captions explain non-English parts).
- [ ] Optional: short text annotations for “Asset,” “App send,” “Delivered in Instagram.”

If you follow this flow, your next submission should satisfy Meta’s requirement for “message sent from your app UI and the same message appearing in the native client.”

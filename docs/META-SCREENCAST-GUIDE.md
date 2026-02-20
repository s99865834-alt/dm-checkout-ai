# Meta App Review – Screencast Guide

Meta’s rejection cited **Developer Policy 1.6** and “Screencast Not Aligned with Use Case Details.” Your use case is allowed; the screencast must show the **full end-to-end experience**. Use the checklist and steps below in one recording.

---

## Meta’s full checklist (all must be in the screencast)

Your screencast must include **all** of the following. Re-submit only when every item is clearly visible.

| # | Requirement | What to show |
|---|-------------|--------------|
| 1 | **Complete Meta login flow** | User starts in your app → clicks “Connect Instagram” (or equivalent) → is redirected to **Instagram or Facebook** → logs in (if needed) → sees the **permission/consent screen**. |
| 2 | **User granting app access to the permission/feature** | The **Meta/Instagram permission screen** where the user taps “Allow” or “Continue” to grant **instagram_business_basic**, **instagram_business_manage_messages**, and **instagram_business_manage_comments**. Do not skip or fast-forward this. |
| 3 | **Asset selection (Page, account, or number visible)** | Back in your app: the **connected Instagram account** clearly visible (e.g. Status: Connected, Username: @…, Account ID). |
| 4 | **Live send action from your app** | A clear moment where **your app sends a message** (e.g. automated reply after a DM, or “Send Test Webhook” with “Send to real user”) and the app shows the **message that was sent** (e.g. the green “Message sent from this app to Instagram” box with the reply text). |
| 5 | **Same message in the native client** | On **Instagram** (native app on phone): the **exact same message** from step 4 visible in the recipient’s DM thread. |
| 6 | **Best practices** | **English** as the app UI language; **captions or tooltips** that explain what is happening (e.g. “Connecting Instagram,” “Granting message permission,” “Reply sent from app,” “Same message in Instagram”); briefly **explain important buttons** (e.g. “Connect Instagram,” “Send Test Webhook”). |

**If your app is server-to-server or uses a system user token:** State in your **submission notes** that the frontend Meta login flow is not visible for that reason, so reviewers don’t expect a user-facing Meta login in the app.

---

## Recommended order for the full flow (one video)

Do this in **one continuous recording** so the end-to-end experience is clear.

### Phase 1: Meta login and permission grant (required)

1. **Start recording.** Open your app in Shopify Admin (English UI).
2. **Show the “Connect Instagram” (or “Connect account”) area** on Home. Add a caption/tooltip: e.g. “User connects Instagram account.”
3. **Click “Connect Instagram.”** Show the redirect to **Instagram** (or Facebook) and the **Meta permission/consent screen** where the user grants access to the app. Do not skip this screen.
4. **Show the user tapping “Allow” or “Continue”** on that permission screen. Add a caption: e.g. “User grants instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments.”
5. **Show the return to your app** and that the account is now connected (Status: Connected, username, Account ID). Add a caption: e.g. “Instagram account connected (asset visible).”

### Phase 2: Asset, send action, same message in native client (required)

6. **Option A – Real DM:** On **phone** (test account), send a **new DM** to your business (e.g. “How much is this?”) so the 24-hour window is open. Back on **desktop**, show the app (Webhook Demo or Messages) and the **automated reply** the app sent, including the **exact reply text** (“Message sent from this app to Instagram” if using Webhook Demo).  
   **Option B – Webhook Demo:** In the app, set “Send to real user,” click **“Send Test Webhook”**, then show the green box with the **exact reply text** that was sent.
7. **On phone:** Open **Instagram** → DMs → conversation with the business. Show the **same reply text** as the latest message. Add a caption: e.g. “Same message delivered in native Instagram.”

---

## Meta review – exact steps (messages use case)

Instagram only delivers messages to users who have messaged your business **in the last 24 hours**. So do the following in one continuous flow so the reply is delivered and visible in the native app.

**Before you hit record:** Have two devices ready – desktop (your app in Shopify Admin) and phone (test Instagram account = Account B). Your business Instagram = Account A (connected to the app).

| Step | What to do | What Meta sees |
|------|------------|----------------|
| **1** | **Start recording.** On desktop: open your app → go to **Home**. Show **Status: Connected**, **Username: @…**, and **Account ID** clearly on screen. | (1) Asset selection |
| **2** | On **phone**: open **Instagram** (Account B). Go to your **business profile (Account A)** → tap **Message** → send one DM, e.g. *"How much is this?"* (This opens the 24-hour window so the next message can be delivered.) | Customer message that triggers your app |
| **3** | On **desktop**: go to **Webhook Demo** or **Analytics → Messages**. Wait a few seconds. Show the **new message** and the **automated reply** that the app sent (e.g. “Webhook processed” or the conversation with the reply text). | (2) Live send from your app |
| **4** | On **phone**: open **Instagram** → **DMs** → conversation with the business. Show the **same reply** from the business as the latest message in the thread. The text must match what the app showed as “Message sent from this app to Instagram.” | (3) Delivered message in native client |

**Important:** The DM in step 2 must be sent **during the recording** (or at most a few minutes before). Then steps 3 and 4 happen right after so the reply is delivered and you can show it in the app and in Instagram. Do not use an old conversation where the 24-hour window has closed.

**If using Webhook Demo with “Send to real user”:** After clicking “Send Test Webhook,” the app shows a green box: **“Message sent from this app to Instagram (show this same message in the native app for review)”** with the exact reply text. Record that box clearly, then show the **same text** in the recipient’s Instagram DMs so reviewers see it’s the same message.

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

- [ ] **Complete Meta login flow** – Redirect to Instagram/Facebook and permission screen are visible (do not skip).
- [ ] **User granting permission** – The Meta consent screen where the user allows the app (instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments) is clearly shown.
- [ ] **Asset visible** – Connected Instagram account (username and/or ID) shown in the app after connect.
- [ ] **Send from app** – A send action in the app (e.g. “Send Test Webhook” or automation replying) and the **exact message text** that was sent visible in the app (e.g. green “Message sent from this app to Instagram” box).
- [ ] **Same message in native client** – That **exact same** message visible in the Instagram app (DMs with the business).
- [ ] **English** – App UI is in English (or captions explain any non-English parts).
- [ ] **Captions/tooltips** – Short text overlays explain steps (e.g. “Connecting Instagram,” “Granting permissions,” “Reply sent from app,” “Same message in Instagram”).
- [ ] **Buttons explained** – Meaning of main buttons (e.g. “Connect Instagram,” “Send Test Webhook”) is clear or explained.

If your app is **server-to-server** or uses a **system user token** and does not show a frontend Meta login, say so in your **submission notes** so reviewers know what to expect.

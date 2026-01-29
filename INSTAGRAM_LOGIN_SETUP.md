# Instagram Login (Business Login) setup

If you see **"Invalid platform app"** when clicking "Connect with Instagram Login", the app is not yet configured for Instagram’s OAuth. Use the **Instagram App ID** from the Business Login settings (not the main Facebook App ID).

## 1. Add Instagram product with Instagram Login (if needed)

1. Open [Meta for Developers](https://developers.facebook.com/) → your app.
2. In the left menu, go to **Instagram** (or add the Instagram product).
3. Under **API setup with Instagram login**, complete **Set up Instagram business login** (add redirect URI, etc.).

## 2. Get Instagram App ID and Secret

1. In the app: **Instagram** → **API setup with Instagram login** → **Set up Instagram business login**.
2. Click **Business login settings**.
3. Copy **Instagram App ID** and **Instagram App Secret** (they may match the main app or be different).

## 3. Add OAuth redirect URI

In the same **Business login settings**:

- Add **OAuth Redirect URI**:  
  `https://YOUR_APP_DOMAIN/meta/instagram-login/callback`  
  (e.g. `https://dm-checkout-ai-production.up.railway.app/meta/instagram-login/callback`)
- Save.

## 4. Set environment variables

Set these where your app runs (e.g. Railway, `.env`):

- **META_INSTAGRAM_APP_ID** = the **Instagram App ID** from Business login settings.
- **META_INSTAGRAM_APP_SECRET** = the **Instagram App Secret** from Business login settings.

Do **not** use the main Facebook App ID for Instagram Login; that causes "Invalid platform app".

## 5. Redeploy and test

Redeploy so the new env vars are picked up, then click **Connect with Instagram Login** again.

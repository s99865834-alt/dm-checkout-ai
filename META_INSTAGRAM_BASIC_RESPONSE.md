# Meta App Review Response: instagram_business_basic Permission

## Why We're Requesting instagram_business_basic

**Yes, `instagram_business_basic` is requested as a dependent permission** for both `instagram_business_manage_messages` and `instagram_business_manage_comments`.

## How Our App Uses This Permission

Our app uses `instagram_business_basic` to:

1. **Account Verification & Display**: Retrieve the Instagram Business account username (e.g., @socialrepl.ai), account ID, media count, and profile picture to display in our app interface. This allows merchants to verify their account is correctly connected and see which Instagram account is linked to their Shopify store.

2. **Instagram Feed Management**: Fetch the account's media/posts to display in our "Instagram Feed" page, where merchants can view their Instagram posts and map them to Shopify products. This enables automated checkout link generation when customers express interest in specific posts via DMs or comments.

3. **Connection Validation**: Verify that the connected account is a valid Instagram Business account with proper permissions during the OAuth connection flow.

## How It Adds Value for Users

- **Visual Confirmation**: Merchants see their Instagram username prominently displayed in the app, confirming successful connection
- **Account Management**: Displaying media count and profile information helps merchants verify they're managing the correct account
- **Product Mapping**: Viewing Instagram posts within the app enables merchants to map content to Shopify products for automated responses with checkout links

## Why It's Necessary for App Functionality

This permission is essential because:

- **Account Verification**: We must retrieve basic account info to verify the connection and display it to merchants. Without this, merchants cannot confirm their account is connected correctly.

- **Core Feature Dependency**: Our Instagram Feed page requires access to media/posts so merchants can map posts to products. This is a core feature that enables automated checkout link generation.

- **Messaging & Comment Management Prerequisites**: To send automated messages via `instagram_business_manage_messages` and manage comments via `instagram_business_manage_comments`, we must first verify which Instagram account is connected and ensure we're operating on the correct account. The `instagram_business_basic` permission provides the account ID and username needed for this verification.

- **User Experience**: Without displaying account information, merchants cannot verify their connection or know which account is linked, leading to confusion and potential errors.

**Without this permission, our app cannot verify Instagram account connections, display connection status, or provide the Instagram Feed feature for product mapping. This is essential for the core functionality of our Instagram automation app.**

---

## Screencast Requirements

**Part 1: Instagram Account Connection (30-45 seconds)**
- Show navigating to the app's Home page
- Click "Connect Instagram Business Account" in the "Instagram Connection" section
- Show OAuth flow: redirect to Meta/Facebook, select Instagram Business account, grant permissions, redirect back
- Show success confirmation

**Part 2: Profile Information Display (30-45 seconds)**
- Show Home page displaying: Instagram Username (@username), Number of Posts, Instagram Business Account ID, Facebook Page ID
- Show Setup page displaying: "✅ Instagram Connected" status with connected username

**Total Duration:** 1-2 minutes

---

## Testing Instructions for App Reviewers

### App Credentials

Reviewers can connect their own Instagram Business account through our app's OAuth flow. No special credentials are provided.

**To access the app:**
- App URL: [Your Shopify App URL]
- Reviewers need access to a Shopify store (development store or their own)
- Reviewers use their own Instagram Business account (must be linked to a Facebook Page)
- Connection uses standard OAuth - reviewers authorize through Meta/Facebook

**Connection Steps:**
1. Navigate to app's Home page
2. Click "Connect Instagram Business Account" in "Instagram Connection" section
3. Complete OAuth flow with their Instagram Business account
4. Grant requested permissions
5. Return to app to see connection confirmed

**Note:** We do not provide Instagram account credentials. Reviewers use their own Instagram Business account through OAuth.

### Where to View Instagram Professional Profile Information

After connecting, profile information is displayed in:

**1. Home Page (`/app`):**
- Location: Main navigation → "Home"
- Section: "Instagram Connection" section
- Displays: ✅ Status "Connected", Instagram Username (@username), Number of Posts, Instagram Business Account ID, Facebook Page ID

**2. Setup Page (`/app/setup`):**
- Location: Main navigation → "Setup"
- Section: "Step 1: Connect Instagram Business Account"
- Displays: ✅ Instagram Connected status, Connected to: @[username], Facebook Page ID

**3. Instagram Feed Page (`/app/instagram-feed`):**
- Location: Main navigation → "Instagram Feed"
- Displays: Instagram posts/media from connected account, post details, media count

**Visual Indicators:** Look for green success boxes with "✅ Instagram Connected" - profile information appears immediately below connection status.

---

## Permission Dependency Clarification

**`instagram_business_basic` is a dependent permission** for:
- `instagram_business_manage_messages` (instagram_manage_messages)
- `instagram_business_manage_comments` (instagram_manage_comments)

**Why it's dependent:**
- To send automated messages, we must verify the Instagram account is valid and retrieve its ID/username to ensure we're messaging from the correct account
- To manage comments, we need account information to identify which account is managing comments and display account info to merchants
- The permission provides username, ID, and media count essential for account verification, connection status display, and ensuring correct account usage for messaging/comment management

**Without `instagram_business_basic`, we cannot verify which account is connected, display account information to merchants, or ensure messaging/comment management is performed on the correct account.**

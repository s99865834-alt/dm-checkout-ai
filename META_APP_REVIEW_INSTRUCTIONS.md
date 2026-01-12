# Meta App Review - Instructions for Developers

## Screencast Requirements

### Part 1: Show Instagram Account Connection

**What to Record:**
1. Open the Shopify app (your app URL)
2. Navigate to the **Home** page
3. In the "Instagram Connection" section, click **"Connect Instagram Business Account"**
4. Show the OAuth flow:
   - Redirect to Meta/Facebook login
   - User selects their Instagram Business account
   - User grants permissions
   - Redirect back to the app
5. Show the success message confirming connection

**Duration:** 30-45 seconds

### Part 2: Show Profile Information Display

**What to Record:**
1. After connection, show the **Home** page where profile information is displayed:
   - Instagram Username (e.g., @socialrepl.ai)
   - Number of Posts (media count)
   - Instagram Business Account ID
   - Facebook Page ID
   - Token expiration date (if shown)
2. Navigate to the **Setup** page and show:
   - "✅ Instagram Connected" status
   - Connected Instagram username displayed
   - Facebook Page ID displayed
3. Optionally show the **Instagram Feed** page where posts are displayed

**Duration:** 30-45 seconds

**Total Screencast Length:** 1-2 minutes

---

## Detailed Testing Instructions for App Reviewers

### App Credentials for Reviewers

**To connect an Instagram professional account to our app, reviewers need:**

1. **Shopify Store Access:**
   - Reviewers can use any Shopify development store or their own Shopify store
   - App URL: [Your Shopify App URL - e.g., https://your-app.myshopify.com/admin/apps/your-app-id]
   - Or access via: [Direct app URL if available]

2. **Instagram Business Account:**
   - Reviewers should use their own Instagram Business or Creator account
   - The account must be linked to a Facebook Page
   - No special credentials needed - they'll use their own Instagram account through OAuth

3. **Connection Process:**
   - Reviewers will go through the standard OAuth flow
   - They'll be redirected to Meta/Facebook to authorize the app
   - They'll select their Instagram Business account and grant permissions
   - The app will automatically connect their account

**Note:** We do not provide Instagram account credentials. Reviewers use their own Instagram Business account through the OAuth authorization flow.

---

### Where to View Instagram Professional Profile Information

After connecting an Instagram Business account, reviewers can view the profile information in the following locations:

#### 1. **Home Page** (`/app`)
   - **Location:** Main navigation → "Home"
   - **Section:** "Instagram Connection" section
   - **Information Displayed:**
     - ✅ Status: "Connected"
     - Instagram Username: @[username]
     - Number of Posts: [media count]
     - Instagram Business Account ID: [ID]
     - Facebook Page ID: [ID]
     - Token expiration date (if applicable)

#### 2. **Setup Page** (`/app/setup`)
   - **Location:** Main navigation → "Setup"
   - **Section:** "Step 1: Connect Instagram Business Account"
   - **Information Displayed:**
     - ✅ Instagram Connected status
     - Connected to: @[username]
     - Facebook Page ID: [ID]

#### 3. **Instagram Feed Page** (`/app/instagram-feed`)
   - **Location:** Main navigation → "Instagram Feed"
   - **Information Displayed:**
     - Instagram posts/media from the connected account
     - Post details (caption, media type, permalink, etc.)
     - Media count (number of posts)

**Screenshot Locations:**
- Home page: Look for the green "✅ Instagram Connected" box in the "Instagram Connection" section
- Setup page: Look for the green success box showing "✅ Instagram Connected" with the username below it

---

### Permission Dependency Clarification

**Yes, `instagram_business_basic` is requested as a dependent permission.**

We are requesting `instagram_business_basic` as a **dependent permission** for both:
- `instagram_manage_messages` (instagram_business_manage_messages)
- `instagram_manage_comments` (instagram_business_manage_comments)

**Why it's dependent:**
- To send automated messages via `instagram_manage_messages`, we must first verify the Instagram Business account is valid and retrieve its basic information (username, ID) to ensure we're messaging from the correct account.

- To manage comments via `instagram_manage_comments`, we need to access the account's basic profile information to identify which account is managing comments and to display account information to merchants.

- The `instagram_business_basic` permission allows us to retrieve the account's username, ID, and media count, which are essential for:
  1. Verifying account connection
  2. Displaying connection status to merchants
  3. Ensuring we're using the correct account for messaging and comment management

**Without `instagram_business_basic`, we cannot:**
- Verify which Instagram account is connected
- Display account information to merchants
- Ensure messaging/comment management is being performed on the correct account

Therefore, `instagram_business_basic` is a necessary dependency for the core messaging and comment management functionality.

---

## Step-by-Step Testing Guide

### Step 1: Access the App
1. Navigate to: [Your Shopify App URL]
2. Log in with a Shopify store (development store or your own)
3. You'll be redirected to the app's Home page

### Step 2: Connect Instagram Business Account
1. On the Home page, scroll to the "Instagram Connection" section
2. Click the **"Connect Instagram Business Account"** button
3. You'll be redirected to Meta/Facebook OAuth page
4. Log in with your Facebook account (the one linked to your Instagram Business account)
5. Select your Instagram Business account
6. Review and approve the requested permissions:
   - instagram_basic
   - pages_show_list
   - pages_read_engagement
   - pages_manage_metadata
   - instagram_manage_comments
   - instagram_manage_messages
7. Click "Continue" or "Authorize"
8. You'll be redirected back to the app

### Step 3: Verify Profile Information Display
1. **On the Home page** (`/app`):
   - Look for the "Instagram Connection" section
   - You should see:
     - ✅ Status: "Connected"
     - Instagram Username: @[your-username]
     - Number of Posts: [your post count]
     - Instagram Business Account ID: [ID number]
     - Facebook Page ID: [ID number]

2. **On the Setup page** (`/app/setup`):
   - Navigate to "Setup" in the main navigation
   - In "Step 1: Connect Instagram Business Account"
   - You should see:
     - ✅ Instagram Connected (green success box)
     - Connected to: @[your-username]
     - Facebook Page ID: [ID number]

3. **On the Instagram Feed page** (`/app/instagram-feed`):
   - Navigate to "Instagram Feed" in the main navigation
   - You should see your Instagram posts displayed
   - This confirms the app can access your account's media

### Step 4: Test Webhook Functionality (Optional)
1. Navigate to "Webhook Demo" page (`/app/webhook-demo`)
2. Select a test scenario (e.g., "Purchase Intent")
3. Click "Send Test Webhook"
4. Observe the results showing webhook processing
5. Check "Recent Messages" section to see the message logged

---

## Troubleshooting

**If connection fails:**
- Ensure your Instagram account is a Business or Creator account
- Verify the account is linked to a Facebook Page
- Check that you're using the correct Facebook account

**If profile information doesn't display:**
- Refresh the page after connection
- Check browser console for any errors
- Verify the OAuth flow completed successfully

**If you need help:**
- Contact: [Your support email]
- Check the Setup page for detailed connection instructions

---

## Summary

**To test Instagram account connection and profile display:**
1. Go to Home page → Click "Connect Instagram Business Account"
2. Complete OAuth flow with your Instagram Business account
3. View profile information on:
   - Home page → "Instagram Connection" section
   - Setup page → "Step 1" section
   - Instagram Feed page → Posts from your account

**Profile information includes:**
- Instagram Username (@username)
- Number of Posts (media count)
- Instagram Business Account ID
- Facebook Page ID

**Permission dependency:**
- `instagram_business_basic` is a dependent permission for `instagram_manage_messages` and `instagram_manage_comments`

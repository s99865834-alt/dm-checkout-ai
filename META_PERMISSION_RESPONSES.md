# Meta App Review - Permission Request Responses

## instagram_business_basic Permission

### How Your App Uses This Permission:

**Detailed Description:**

Our app uses the `instagram_business_basic` permission to:

1. **Account Verification and Display**:
   - Retrieve the Instagram Business account's username (e.g., @socialrepl.ai) to display in the app's user interface
   - Fetch the account's basic profile information (username, ID, media count, profile picture) to confirm successful connection
   - Display this information on the Home page and Setup page so merchants can verify their Instagram account is properly connected

2. **Instagram Feed Management**:
   - Retrieve the account's media count to show merchants how many posts they have
   - Fetch Instagram posts/media objects to display in the "Instagram Feed" page within our app
   - Allow merchants to view their Instagram posts and map them to Shopify products for automated checkout link generation

3. **Account Validation**:
   - Verify that the connected account is a valid Instagram Business account
   - Ensure the account has the necessary permissions and is properly linked to a Facebook Page
   - Validate account connection status during the OAuth flow

**Specific API Calls Made:**
- `GET /{ig-business-id}` with fields: `username`, `media_count`, `profile_picture_url`
- `GET /{ig-business-id}/media` to fetch posts for the Instagram Feed page

### How It Adds Value for Users:

1. **Visual Confirmation**: Merchants can immediately see their Instagram username displayed in the app, confirming their account is connected correctly. This builds trust and confidence in the integration.

2. **Account Management**: By displaying media count and profile information, merchants can verify they're managing the correct Instagram account, especially if they have multiple accounts.

3. **Product Mapping**: The ability to view Instagram posts within our app allows merchants to easily map their Instagram content to Shopify products, enabling automated checkout link generation when customers express interest in specific posts.

4. **Setup Verification**: During the setup process, displaying the connected Instagram account information helps merchants confirm the connection was successful before proceeding with automation configuration.

### Why It's Necessary for App Functionality:

1. **Core Feature Requirement**: Our app's primary function is to automate responses to Instagram messages. To do this, we must:
   - Verify the Instagram Business account is valid and accessible
   - Display account information so merchants know which account is connected
   - Access basic account metadata to ensure proper functionality

2. **User Experience**: Without this permission, merchants would have no way to verify their account connection or see which Instagram account is linked to their Shopify store. This would create confusion and reduce trust in the app.

3. **Product Mapping Feature**: Our Instagram Feed page allows merchants to map Instagram posts to Shopify products. This feature requires access to the account's media/posts, which is part of the `instagram_business_basic` permission scope.

4. **Error Prevention**: By retrieving and displaying account information, we can detect connection issues early and provide helpful error messages to merchants, preventing automation failures.

**Without this permission, our app cannot:**
- Verify Instagram account connections
- Display which account is connected to the merchant
- Show Instagram posts for product mapping
- Provide account validation during setup

This permission is essential for the core functionality of our Instagram automation app.

---

## Alternative Shorter Version (if character limit):

**How We Use It:**
Our app uses `instagram_business_basic` to retrieve the Instagram Business account's username, ID, and media count. We display this information in the app interface so merchants can verify their account is connected correctly. We also use it to fetch Instagram posts for our "Instagram Feed" page, where merchants can map posts to Shopify products for automated checkout link generation.

**Value for Users:**
Merchants can see their connected Instagram account username displayed in the app, confirming successful connection. They can also view and manage their Instagram posts within our app to set up product mappings for automated responses.

**Why It's Necessary:**
This permission is essential for account verification, displaying connection status, and enabling our Instagram Feed feature where merchants map posts to products. Without it, merchants cannot verify their account connection or use the product mapping functionality that enables automated checkout links in responses.

# Meta API Test Calls for instagram_business_manage_comments

## Overview
Meta requires you to make actual API test calls to demonstrate that your app can use the `instagram_business_manage_comments` permission. These test calls need to be made through Meta's Testing interface in the App Dashboard.

## Required API Endpoints to Test

For `instagram_business_manage_comments`, you need to test:

1. **Read Comments** - `GET /{ig-media-id}/comments`
   - This reads comments on an Instagram post
   - Required to demonstrate you can read comments

2. **Get Comment Details** - `GET /{comment-id}`
   - This gets details of a specific comment
   - Required to demonstrate you can access comment data

## How to Complete the API Test Calls

### Step 1: Go to Meta App Dashboard
1. Log into [Meta for Developers](https://developers.facebook.com/)
2. Go to your app dashboard
3. Navigate to **App Review** → **Permissions and Features**
4. Find `instagram_business_manage_comments` in the list
5. Click on it to see the testing requirements

### Step 2: Use Meta's Graph API Explorer
1. Go to **Tools** → **Graph API Explorer** in your Meta App Dashboard
2. Select your app from the dropdown
3. Select a test user or page that has an Instagram Business account connected
4. Add the `instagram_business_manage_comments` permission to the token

### Step 3: Make the Required API Calls

#### Test Call 1: Read Comments on a Post
```
GET /{ig-media-id}/comments
```

**Steps:**
1. First, get a media ID from your Instagram account:
   ```
   GET /{ig-business-id}/media
   ```
   This will return a list of your Instagram posts with their media IDs.

2. Then, read comments on one of those posts:
   ```
   GET /{media-id}/comments
   ```
   Replace `{media-id}` with an actual media ID from step 1.

**Example:**
```
GET /17841478724885002/media
```
Returns:
```json
{
  "data": [
    {
      "id": "17982823325781858",
      "caption": "...",
      ...
    }
  ]
}
```

Then:
```
GET /17982823325781858/comments
```
Returns:
```json
{
  "data": [
    {
      "id": "comment-id-123",
      "text": "Great product!",
      "timestamp": "2024-01-01T00:00:00+0000",
      "from": {
        "id": "user-id",
        "username": "username"
      }
    }
  ]
}
```

#### Test Call 2: Get Comment Details
```
GET /{comment-id}
```

**Steps:**
1. Use a comment ID from the previous call
2. Get details of that specific comment:
   ```
   GET /{comment-id}?fields=id,text,timestamp,from
   ```

**Example:**
```
GET /comment-id-123?fields=id,text,timestamp,from
```

### Step 4: Submit Test Results
1. After making the API calls successfully, go back to **App Review** → **Permissions and Features**
2. Click on `instagram_business_manage_comments`
3. You should see an option to submit your test results
4. Meta will verify that the API calls were made successfully

## Important Notes

- **Test calls can take up to 24 hours to show** in your app dashboard
- Make sure you're using a **test user/page** with an Instagram Business account connected
- The API calls must be made **while the permission is in development mode**
- You need to have actual comments on your Instagram posts to test reading them

## Alternative: Use Your App's Test Endpoint

If you want to make these calls programmatically through your app, you can create a test endpoint. Here's what the calls would look like in your code:

```javascript
// Read comments on a post
const comments = await metaGraphAPI(
  `/${mediaId}/comments`,
  accessToken,
  {
    params: {
      fields: "id,text,timestamp,from"
    }
  }
);

// Get specific comment details
const comment = await metaGraphAPI(
  `/${commentId}`,
  accessToken,
  {
    params: {
      fields: "id,text,timestamp,from"
    }
  }
);
```

## Troubleshooting

- **"Permission denied"**: Make sure you've added the permission to your app and it's approved for testing
- **"Invalid media ID"**: Make sure you're using an Instagram media ID, not a post URL
- **"No comments found"**: Make sure the post actually has comments, or add a test comment first
- **"Token expired"**: Generate a new access token in Graph API Explorer

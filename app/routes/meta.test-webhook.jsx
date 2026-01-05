/**
 * Test Webhook Endpoint
 * 
 * This endpoint allows you to manually test webhook events locally
 * before Meta app approval. You can send test payloads to verify
 * your webhook handling logic works correctly.
 * 
 * Usage:
 * POST /meta/test-webhook with a JSON body containing test webhook data
 * 
 * This should be removed or secured before production.
 */

export const action = async ({ request }) => {
  // Allow in production for testing before app approval
  // TODO: Remove or secure this endpoint after Meta app approval

  try {
    const body = await request.json();
    
    console.log("[test-webhook] Received test webhook payload:", JSON.stringify(body, null, 2));

    // Import the actual webhook handler
    const { action: webhookAction } = await import("./webhooks.meta.jsx");
    
    // Create a mock request with the test payload
    const mockRequest = new Request(request.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...request.headers,
      },
      body: JSON.stringify(body),
    });

    // Call the actual webhook handler
    const response = await webhookAction({ request: mockRequest });
    
    return new Response(
      JSON.stringify({
        success: true,
        message: "Test webhook processed",
        responseStatus: response.status,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[test-webhook] Error processing test webhook:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const loader = async () => {
  return new Response(
    JSON.stringify({
      message: "Test webhook endpoint",
      instructions: "POST a JSON payload here to test webhook handling",
      example: {
        object: "instagram",
        entry: [
          {
            id: "test_ig_business_id",
            messaging: [
              {
                sender: { id: "test_user_id" },
                recipient: { id: "test_ig_business_id" },
                message: {
                  mid: "test_message_id",
                  text: "I want to buy this product",
                },
                timestamp: Date.now(),
              },
            ],
          },
        ],
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};


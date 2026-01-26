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

    // Extract message text for preview (from either messaging or comment event)
    let messageText = "";
    let mediaId = null;
    let isCommentEvent = false;
    
    // Check if it's a comment event (Comment > DM scenario)
    if (body?.entry?.[0]?.changes?.[0]?.field === "comments") {
      const commentValue = body?.entry?.[0]?.changes?.[0]?.value;
      messageText = commentValue?.text || "";
      mediaId = commentValue?.media?.id || null;
      isCommentEvent = true;
    } else {
      // Direct DM scenario
      messageText = body?.entry?.[0]?.messaging?.[0]?.message?.text || "";
    }
    
    const igBusinessId = body?.entry?.[0]?.id || "";
    
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
    
    // Generate AI preview directly (don't wait for async processing)
    let aiPreview = null;
    if (messageText && igBusinessId) {
      try {
        const { getShopWithPlan } = await import("../lib/loader-helpers.server");
        const { authenticate } = await import("../shopify.server");
        
        // Get shop from session
        try {
          const { session } = await authenticate.admin(request);
          if (session?.shop) {
            const { shop, plan } = await getShopWithPlan(request);
            
            if (shop?.id) {
              // Classify the message directly
              const { classifyMessage } = await import("../lib/ai.server");
              const classification = await classifyMessage(messageText, { shopId: shop.id });
              
              if (classification && !classification.error && classification.intent) {
                // Generate preview response if message would trigger automation
                // Note: price_request indicates purchase intent, so we should respond with checkout link
                const productSpecificIntents = ["purchase", "product_question", "variant_inquiry", "price_request"];
                const generalIntents = ["store_question"];
                const eligibleIntents = [...productSpecificIntents, ...generalIntents];
                
                if (eligibleIntents.includes(classification.intent)) {
                  const { getBrandVoice } = await import("../lib/db.server");
                  const brandVoiceData = await getBrandVoice(shop.id);
                  
                  // Handle store_question separately (doesn't need product mapping)
                  if (classification.intent === "store_question") {
                    const { generateReplyMessage } = await import("../lib/automation.server");
                    const { getShopifyStoreInfo } = await import("../lib/shopify-data.server");
                    const storeInfo = await getShopifyStoreInfo(shop.shopify_domain);
                    const replyText = await generateReplyMessage(
                      brandVoiceData,
                      null,
                      null,
                      classification.intent,
                      null,
                      null,
                      messageText,
                      storeInfo,
                      {
                        originChannel: isCommentEvent ? "comment" : "dm",
                        inboundChannel: isCommentEvent ? "comment" : "dm",
                        triggerChannel: isCommentEvent ? "comment" : "dm",
                        recentMessages: [{ channel: isCommentEvent ? "comment" : "dm", text: messageText }],
                      }
                    );
                    
                    aiPreview = {
                      intent: classification.intent,
                      confidence: classification.confidence,
                      sentiment: classification.sentiment,
                      responseText: replyText,
                      wouldSend: true,
                      hasProductContext: false,
                      testType: isCommentEvent ? "comment" : "dm",
                    };
                  } else {
                    // Product-specific intents need product mappings
                    const { getProductMappings } = await import("../lib/db.server");
                    const { buildCheckoutLink, buildProductPageLink } = await import("../lib/automation.server");
                    
                    const productMappings = await getProductMappings(shop.id);
                    
                    // For comment events, find product mapping by media_id
                    // For Direct DM events, do NOT use product mappings - no product context available
                    let productMapping = null;
                    if (isCommentEvent && mediaId) {
                      // Comment > DM: Find product mapping for this specific media ID
                      productMapping = productMappings?.find((m) => m.ig_media_id === mediaId);
                    }
                    // Direct DM: Do NOT use product mappings - we don't know which product they're referring to
                    
                    if (productMapping) {
                      
                      // For product_question and variant_inquiry, use PDP link first; for others, use checkout link
                      let productPageUrl = null;
                      let checkoutUrl = null;
                      
                      if (classification.intent === "product_question" || classification.intent === "variant_inquiry") {
                        // For product questions and variant inquiries, use PDP link first
                        productPageUrl = await buildProductPageLink(
                          shop,
                          productMapping.product_id,
                          productMapping.variant_id,
                          productMapping.product_handle || null
                        );
                        // Also generate checkout link for after they see product details
                        const checkoutLink = await buildCheckoutLink(
                          shop,
                          productMapping.product_id,
                          productMapping.variant_id,
                          1
                        );
                        checkoutUrl = checkoutLink.url;
                      } else {
                        // For purchase intent, price requests - use checkout link
                        const checkoutLink = await buildCheckoutLink(
                          shop,
                          productMapping.product_id,
                          productMapping.variant_id,
                          1
                        );
                        checkoutUrl = checkoutLink.url;
                      }
                      
                      // Import the actual generateReplyMessage function to match behavior
                      const { generateReplyMessage } = await import("../lib/automation.server");
                      // Pass the intent, links, and original message so the AI can understand context
                      const replyText = await generateReplyMessage(
                        brandVoiceData,
                        null,
                        checkoutUrl,
                        classification.intent,
                        null,
                        productPageUrl,
                        messageText,
                        null,
                        {
                          originChannel: "comment",
                          inboundChannel: "comment",
                          triggerChannel: "comment",
                          recentMessages: [{ channel: "comment", text: messageText }],
                        }
                      );
                      
                      aiPreview = {
                        intent: classification.intent,
                        confidence: classification.confidence,
                        sentiment: classification.sentiment,
                        responseText: replyText,
                        wouldSend: true,
                        hasProductContext: isCommentEvent && mediaId ? true : false,
                        testType: isCommentEvent ? "comment" : "dm",
                        mediaId: mediaId || null,
                        productMappingFound: !!productMapping,
                      };
                    } else {
                      // No product mapping found
                      // For Direct DMs with product-specific intents: PRO tier asks for clarification, others skip
                      if (!isCommentEvent && plan.followup === true) {
                        // PRO tier: Generate clarifying question
                        const { generateClarifyingQuestion } = await import("../lib/automation.server");
                        const clarifyingReply = await generateClarifyingQuestion(
                          brandVoiceData,
                          messageText,
                          classification.intent,
                          { originChannel: "dm", inboundChannel: "dm" }
                        );
                        
                        aiPreview = {
                          intent: classification.intent,
                          confidence: classification.confidence,
                          sentiment: classification.sentiment,
                          responseText: clarifyingReply,
                          wouldSend: true,
                          reason: "PRO tier: Will ask customer which product they're referring to",
                          hasProductContext: false,
                          testType: "dm",
                          mediaId: null,
                          productMappingFound: false,
                          isClarifyingQuestion: true,
                        };
                      } else {
                        const reason = isCommentEvent && mediaId 
                          ? `No product mapping found for media ID: ${mediaId}` 
                          : plan.followup === true 
                            ? "Direct DM without product context - cannot determine which product customer is referring to"
                            : `Direct DM without product context - cannot determine which product customer is referring to (follow-up not available on ${plan.name} plan)`;
                        
                        aiPreview = {
                          intent: classification.intent,
                          confidence: classification.confidence,
                          sentiment: classification.sentiment,
                          responseText: null,
                          wouldSend: false,
                          reason: reason,
                          hasProductContext: false,
                          testType: isCommentEvent ? "comment" : "dm",
                          mediaId: mediaId || null,
                          productMappingFound: false,
                        };
                      }
                    }
                  }
                } else {
                  aiPreview = {
                    intent: classification.intent,
                    confidence: classification.confidence,
                    sentiment: classification.sentiment,
                    responseText: null,
                    wouldSend: false,
                    reason: `Intent "${classification.intent}" not eligible for automation`,
                  };
                }
              } else {
                aiPreview = {
                  intent: classification?.intent || "none",
                  confidence: classification?.confidence || 0,
                  sentiment: classification?.sentiment || "neutral",
                  responseText: null,
                  wouldSend: false,
                  reason: classification?.error || "Could not classify message",
                };
              }
            }
          }
        } catch (authError) {
          // If auth fails, still return success but without preview
          console.log("[test-webhook] Could not generate preview (auth failed):", authError.message);
        }
      } catch (previewError) {
        console.error("[test-webhook] Could not generate preview:", previewError);
        aiPreview = {
          intent: "none",
          confidence: 0,
          sentiment: "neutral",
          responseText: null,
          wouldSend: false,
          reason: `Error generating preview: ${previewError.message}`,
        };
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: "Test webhook processed",
        responseStatus: response.status,
        aiPreview: aiPreview,
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


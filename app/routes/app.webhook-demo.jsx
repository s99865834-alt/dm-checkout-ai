import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMetaAuth } from "../lib/meta.server";
import { getProductMappings, getSettings } from "../lib/db.server";
import supabase from "../lib/supabase.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);

  let metaAuth = null;
  let recentMessages = [];
  let productMappings = [];
  let settings = null;

  if (shop?.id) {
    metaAuth = await getMetaAuth(shop.id);
    productMappings = await getProductMappings(shop.id);
    settings = await getSettings(shop.id);

    // Get recent messages for display with links_sent (to get reply text)
    if (metaAuth?.ig_business_id) {
      const { data: messages } = await supabase
        .from("messages")
        .select("*")
        .eq("shop_id", shop.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (messages && messages.length > 0) {
        // Get links_sent for these messages to get reply text (if automation actually sent)
        const messageIds = messages.map((m) => m.id);
        const { data: linksSent } = await supabase
          .from("links_sent")
          .select("message_id, reply_text")
          .in("message_id", messageIds);

        // Create a map of message_id -> reply_text
        const replyTextMap = {};
        if (linksSent) {
          linksSent.forEach((link) => {
            if (link.message_id && link.reply_text) {
              replyTextMap[link.message_id] = link.reply_text;
            }
          });
        }

        // Generate AI response preview for each message (same logic as Step 2)
        const { getProductMappings, getBrandVoice } = await import("../lib/db.server");
        const {
          buildCheckoutLink,
          buildProductPageLink,
          generateReplyMessage,
          generateClarifyingQuestion,
        } = await import("../lib/automation.server");
        const { getShopifyStoreInfo } = await import("../lib/shopify-data.server");
        
        const productMappings = await getProductMappings(shop.id);
        const brandVoiceData = await getBrandVoice(shop.id);
        const productSpecificIntents = ["purchase", "product_question", "variant_inquiry", "price_request"];
        const generalIntents = ["store_question"];
        const eligibleIntents = [...productSpecificIntents, ...generalIntents];

        // Attach reply text to messages (from links_sent or generate preview)
        recentMessages = await Promise.all(messages.map(async (msg) => {
          // If we have an actual sent reply, use that
          if (replyTextMap[msg.id]) {
            return {
              ...msg,
              reply_text: replyTextMap[msg.id],
              reply_source: "sent", // Indicates this was actually sent
            };
          }

          // Otherwise, generate a preview (same as Step 2)
          if (msg.ai_intent && eligibleIntents.includes(msg.ai_intent)) {
            try {
              const isDirectDm = msg.channel === "dm";

              // Handle store_question separately (doesn't need product mapping)
              if (msg.ai_intent === "store_question") {
                const storeInfo = await getShopifyStoreInfo(shop.shopify_domain);
                const previewReply = await generateReplyMessage(
                  brandVoiceData,
                  null,
                  null,
                  msg.ai_intent,
                  null,
                  null,
                  msg.text,
                  storeInfo,
                  {
                    originChannel: msg.channel,
                    inboundChannel: msg.channel,
                    triggerChannel: msg.channel,
                    recentMessages: [{ channel: msg.channel, text: msg.text, created_at: msg.created_at }],
                  }
                );
                
                return {
                  ...msg,
                  reply_text: previewReply,
                  reply_source: "preview",
                };
              }

              // Direct DMs have no product context. For product-specific intents:
              // - PRO: ask a clarifying question
              // - non-PRO: no response
              if (isDirectDm && productSpecificIntents.includes(msg.ai_intent)) {
                if (plan?.followup === true) {
                  const clarifyingReply = await generateClarifyingQuestion(
                    brandVoiceData,
                    msg.text,
                    msg.ai_intent,
                    { originChannel: "dm", inboundChannel: "dm" }
                  );
                  return {
                    ...msg,
                    reply_text: clarifyingReply,
                    reply_source: "preview",
                  };
                }

                return {
                  ...msg,
                  reply_text: null,
                  reply_source: null,
                };
              }
              
              // Product-specific intents need product mappings
              if (!productMappings || productMappings.length === 0) {
                return {
                  ...msg,
                  reply_text: null,
                  reply_source: null,
                };
              }
              
              const productMapping = productMappings[0];
              let productPageUrl = null;
              let checkoutUrl = null;
              
              if (msg.ai_intent === "product_question" || msg.ai_intent === "variant_inquiry") {
                productPageUrl = await buildProductPageLink(
                  shop,
                  productMapping.product_id,
                  productMapping.variant_id,
                  productMapping.product_handle || null,
                  true // Shorten URLs for demo
                );
                const checkoutLink = await buildCheckoutLink(
                  shop,
                  productMapping.product_id,
                  productMapping.variant_id,
                  1,
                  true // Shorten URLs for demo
                );
                checkoutUrl = checkoutLink.url;
              } else {
                const checkoutLink = await buildCheckoutLink(
                  shop,
                  productMapping.product_id,
                  productMapping.variant_id,
                  1,
                  true // Shorten URLs for demo
                );
                checkoutUrl = checkoutLink.url;
              }

              const previewReply = await generateReplyMessage(
                brandVoiceData,
                null,
                checkoutUrl,
                msg.ai_intent,
                null,
                productPageUrl,
                msg.text,
                null,
                {
                  originChannel: msg.channel,
                  inboundChannel: msg.channel,
                  triggerChannel: msg.channel,
                  lastProductLink: {
                    url: (msg.ai_intent === "product_question" || msg.ai_intent === "variant_inquiry") && productPageUrl
                      ? productPageUrl
                      : checkoutUrl,
                    product_id: productMapping.product_id,
                    variant_id: productMapping.variant_id,
                    trigger_channel: msg.channel,
                  },
                  recentMessages: [{ channel: msg.channel, text: msg.text, created_at: msg.created_at }],
                }
              );

              return {
                ...msg,
                reply_text: previewReply,
                reply_source: "preview", // Indicates this is a preview, not actually sent
              };
            } catch (error) {
              console.error(`[webhook-demo] Error generating preview for message ${msg.id}:`, error);
              return {
                ...msg,
                reply_text: null,
                reply_source: null,
              };
            }
          }

          // No eligible intent or no product mapping
          return {
            ...msg,
            reply_text: null,
            reply_source: null,
          };
        }));
      } else {
        recentMessages = [];
      }
    }
  }

  return { shop, plan, metaAuth, recentMessages, productMappings, settings };
};

export default function WebhookDemo() {
  const { shop, plan, metaAuth, recentMessages, productMappings, settings } = useLoaderData();
  const revalidator = useRevalidator();
  const [selectedExample, setSelectedExample] = useState("purchase");
  const [testType, setTestType] = useState("dm"); // "dm" or "comment"
  const [customMessage, setCustomMessage] = useState("");
  const [demoResults, setDemoResults] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const igBusinessId = metaAuth?.ig_business_id || "17841478724885002";
  
  // Get first product mapping for comment > DM scenario (to provide product context)
  const firstProductMapping = productMappings && productMappings.length > 0 ? productMappings[0] : null;
  const testMediaId = firstProductMapping?.ig_media_id || "test_media_123"; // Use actual media ID if available

  const examples = {
    purchase: {
      name: "Purchase Intent",
      message: "I want to buy this product",
      description: "Customer wants to purchase a product",
    },
    question: {
      name: "Product Question",
      message: "What colors does this come in?",
      description: "Customer asking about product details",
    },
    size: {
      name: "Size Inquiry",
      message: "Do you have this in a large size?",
      description: "Customer asking about product size",
    },
    custom: {
      name: "Custom Message",
      message: customMessage,
      description: "Test with your own message",
    },
  };

  const handleSendTestWebhook = async () => {
    const example = examples[selectedExample];
    const messageText = selectedExample === "custom" ? customMessage : example.message;

    if (!messageText.trim()) {
      alert("Please enter a message");
      return;
    }

    setIsRunning(true);
    setDemoResults({
      status: "sending",
      step: "Sending test webhook...",
      timestamp: new Date().toISOString(),
    });

    let testPayload;
    
    if (testType === "comment") {
      // Comment > DM scenario: Comment event that triggers DM with product context
      const testCommentId = `test_comment_${Date.now()}`;
      const testUserId = `test_user_${Date.now()}`;
      
      testPayload = {
        object: "instagram",
        entry: [
          {
            id: igBusinessId,
            changes: [
              {
                field: "comments",
                value: {
                  id: testCommentId,
                  text: messageText,
                  from: {
                    id: testUserId,
                    username: "test_user",
                  },
                  media: {
                    id: testMediaId,
                  },
                  created_time: Math.floor(Date.now() / 1000).toString(),
                },
              },
            ],
          },
        ],
      };
    } else {
      // Direct DM scenario: No product context
      testPayload = {
        object: "instagram",
        entry: [
          {
            id: igBusinessId,
            messaging: [
              {
                sender: { id: `test_user_${Date.now()}` },
                recipient: { id: igBusinessId },
                message: {
                  mid: `test_message_${Date.now()}`,
                  text: messageText,
                },
                timestamp: Math.floor(Date.now() / 1000),
              },
            ],
          },
        ],
      };
    }

    try {
      const response = await fetch("/meta/test-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testPayload),
      });

      const result = await response.json();

      setDemoResults({
        status: result.success ? "success" : "error",
        step: result.success ? "Webhook processed successfully!" : "Error processing webhook",
        message: result.message || result.error,
        timestamp: new Date().toISOString(),
        payload: testPayload,
        aiPreview: result.aiPreview || null,
      });

      // Refresh messages after a short delay (without full page reload)
      if (result.success) {
        setTimeout(() => {
          revalidator.revalidate();
        }, 2000);
      }
    } catch (error) {
      setDemoResults({
        status: "error",
        step: "Error sending webhook",
        message: error.message,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <s-page heading="Webhook Demo - Meta App Review">
      <s-section heading="How to use this page (Meta review)">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="info-subdued">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <s-text variant="strong">What this page is:</s-text>{" "}
              This page demonstrates the webhook functionality for Meta App Review. Use it to show how your app
              processes Instagram messages and sends automated replies.
            </s-paragraph>

            <s-paragraph>
              <s-text variant="strong">How to demonstrate functionality:</s-text>
            </s-paragraph>
            <s-stack direction="block" gap="tight">
              <s-paragraph>
                <s-text variant="subdued">
                  1. Choose a test type (Direct DM or Comment → DM) and a scenario in Step 1
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">
                  2. Click “Send Test Webhook” to simulate an Instagram event
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">
                  3. Review the intent + response decision in Step 2
                </s-text>
              </s-paragraph>
              <s-paragraph>
                <s-text variant="subdued">
                  4. Confirm the message was logged in Step 3 (database)
                </s-text>
              </s-paragraph>
            </s-stack>

            <s-paragraph>
              <s-text variant="subdued" className="srItalic">
                Note: Real-time webhooks require the Meta app to be in Live mode. This page demonstrates the same
                processing using test webhooks for review.
              </s-text>
            </s-paragraph>

            {settings && (
              <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="strong">Current Automation Controls:</s-text>
                  <s-stack direction="block" gap="tight">
                    <s-text variant="subdued">
                      DM automation: {settings.dm_automation_enabled === false ? "Off" : "On"}
                    </s-text>
                    <s-text variant="subdued">
                      Comment automation: {settings.comment_automation_enabled === false ? "Off" : "On"}
                    </s-text>
                    <s-text variant="subdued">
                      Follow-up automation: {settings.followup_enabled === true ? "On" : "Off"}
                    </s-text>
                    {settings.channel_preference && settings.channel_preference !== "both" && (
                      <s-text variant="subdued">
                        Channel preference: {settings.channel_preference === "dm" ? "DM only" : "Comment only"}
                      </s-text>
                    )}
                  </s-stack>
                </s-stack>
              </s-box>
            )}
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Step 1: Send Test Webhook">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <s-text variant="strong">Select test type:</s-text>
            </s-paragraph>
            
            <s-stack direction="block" gap="tight">
              <label className="srChoiceRow">
                <input
                  type="radio"
                  name="testType"
                  value="dm"
                  checked={testType === "dm"}
                  onChange={(e) => setTestType(e.target.value)}
                />
                <s-stack direction="block" gap="tight">
                  <s-text variant="strong">📩 Direct DM</s-text>
                  <s-text variant="subdued">
                    Tests a direct DM without product context. The AI won't know which product the customer is asking about unless mentioned in the message.
                  </s-text>
                </s-stack>
              </label>
              
              <label className="srChoiceRow">
                <input
                  type="radio"
                  name="testType"
                  value="comment"
                  checked={testType === "comment"}
                  onChange={(e) => setTestType(e.target.value)}
                />
                <s-stack direction="block" gap="tight">
                  <s-text variant="strong">💬 Comment → DM</s-text>
                  <s-text variant="subdued">
                    Tests a comment on an Instagram post that triggers a DM. The AI has product context from the post mapping.
                    {firstProductMapping ? ` Using product mapping for media ID: ${testMediaId}` : " ⚠️ No product mapping found - please map a product first"}
                  </s-text>
                </s-stack>
              </label>
            </s-stack>
            
            <s-paragraph>
              <s-text variant="strong">Select a test scenario:</s-text>
            </s-paragraph>

            <s-stack direction="block" gap="tight">
              {Object.entries(examples).map(([key, example]) => (
                <label key={key} className="srChoiceRow">
                  <input
                    type="radio"
                    name="example"
                    value={key}
                    checked={selectedExample === key}
                    onChange={(e) => setSelectedExample(e.target.value)}
                  />
                  <s-stack direction="block" gap="tight">
                    <s-text variant="strong">{example.name}</s-text>
                    <s-text variant="subdued">
                      {example.description}
                    </s-text>
                    {key !== "custom" && (
                      <s-text variant="subdued" className="srItalic">
                        "{example.message}"
                      </s-text>
                    )}
                  </s-stack>
                </label>
              ))}
            </s-stack>

            {selectedExample === "custom" && (
              <label>
                <s-text variant="subdued">Custom Message</s-text>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Enter your test message here..."
                  rows={3}
                  className="srTextarea"
                />
              </label>
            )}

            <s-button
              variant="primary"
              onClick={handleSendTestWebhook}
              disabled={isRunning || (selectedExample === "custom" && !customMessage.trim())}
            >
              {isRunning ? "Processing..." : "Send Test Webhook"}
            </s-button>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="Step 2: Webhook Processing Results">
        {demoResults ? (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background={demoResults.status === "success" ? "success-subdued" : "critical-subdued"}
          >
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="base" alignment="center">
                {demoResults.status === "success" ? (
                  <s-text variant="strong" tone="success">✅ {demoResults.step}</s-text>
                ) : (
                  <s-text variant="strong" tone="critical">❌ {demoResults.step}</s-text>
                )}
                <s-text variant="subdued">
                  {new Date(demoResults.timestamp).toLocaleTimeString()}
                </s-text>
              </s-stack>

              {demoResults.message && (
                <s-text variant="subdued">{demoResults.message}</s-text>
              )}

              {demoResults.status === "success" && (
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="tight">
                    <s-text variant="strong">What happened:</s-text>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="subdued">
                        1. ✅ Webhook received and validated
                      </s-text>
                      <s-text variant="subdued">
                        2. ✅ Message logged to database
                      </s-text>
                      <s-text variant="subdued">
                        3. ✅ AI classified message intent
                      </s-text>
                      <s-text variant="subdued">
                        4. ✅ Automated reply sent (if conditions met)
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-box>
              )}

              {/* AI Preview */}
              {demoResults.aiPreview && (
                <s-box padding="base" borderWidth="base" borderRadius="base" background="info-subdued">
                  <s-stack direction="block" gap="base">
                    <s-text variant="strong">AI Analysis & Response Preview:</s-text>
                    
                    <s-stack direction="block" gap="tight">
                      {/* Show test type and product context */}
                      {demoResults.aiPreview.hasProductContext !== undefined && (
                        <s-box padding="tight" borderWidth="base" borderRadius="base" background={demoResults.aiPreview.hasProductContext ? "success-subdued" : "subdued"}>
                          <s-stack direction="inline" gap="tight" alignment="center">
                            {demoResults.aiPreview.hasProductContext ? (
                              <>
                                <s-text variant="strong" tone="success">✅ Comment → DM</s-text>
                                <s-text variant="subdued">Has product context from Instagram post</s-text>
                                {demoResults.aiPreview.mediaId && (
                                  <s-text variant="subdued">(Media ID: {demoResults.aiPreview.mediaId})</s-text>
                                )}
                              </>
                            ) : (
                              <>
                                <s-text variant="strong">📩 Direct DM</s-text>
                                <s-text variant="subdued">No product context (unless mentioned in message)</s-text>
                              </>
                            )}
                          </s-stack>
                        </s-box>
                      )}
                      
                      <s-stack direction="inline" gap="base" alignment="center">
                        <s-text variant="subdued">
                          <s-text variant="strong">Intent:</s-text> {demoResults.aiPreview.intent || "none"}
                        </s-text>
                        {demoResults.aiPreview.confidence && (
                          <s-text variant="subdued">
                            <s-text variant="strong">Confidence:</s-text> {(demoResults.aiPreview.confidence * 100).toFixed(0)}%
                          </s-text>
                        )}
                        {demoResults.aiPreview.sentiment && (
                          <s-text variant="subdued">
                            <s-text variant="strong">Sentiment:</s-text> {demoResults.aiPreview.sentiment}
                          </s-text>
                        )}
                      </s-stack>

                          {demoResults.aiPreview.wouldSend && demoResults.aiPreview.responseText ? (
                            <s-box padding="base" borderWidth="base" borderRadius="base" background={demoResults.aiPreview.isClarifyingQuestion ? "info-subdued" : "base"}>
                              <s-stack direction="block" gap="tight">
                                <s-text variant="strong">
                                  {demoResults.aiPreview.isClarifyingQuestion ? (
                                    <>💬 Would Send Clarifying Question (PRO tier):</>
                                  ) : (
                                    <>✅ Would Send Automated Response:</>
                                  )}
                                </s-text>
                                {demoResults.aiPreview.isClarifyingQuestion && (
                                  <s-text variant="subdued" className="srItalic">
                                    PRO tier can ask which product the customer is referring to since follow-up is enabled
                                  </s-text>
                                )}
                                <s-text variant="subdued" className="srPreWrap">
                                  {demoResults.aiPreview.responseText}
                                </s-text>
                              </s-stack>
                            </s-box>
                          ) : (
                            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                              <s-stack direction="block" gap="tight">
                                <s-text variant="strong">
                                  ⚠️ Would NOT Send Automated Response
                                </s-text>
                                <s-text variant="subdued">
                                  {demoResults.aiPreview.reason || "Message does not meet criteria for automation"}
                                </s-text>
                              </s-stack>
                            </s-box>
                          )}
                    </s-stack>
                  </s-stack>
                </s-box>
              )}
            </s-stack>
          </s-box>
        ) : (
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-paragraph>
              <s-text variant="subdued">
                Results will appear here after you send a test webhook in Step 1 above.
              </s-text>
            </s-paragraph>
          </s-box>
        )}
      </s-section>

      <s-section heading="Step 3: Recent Messages (Database)">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          {recentMessages.length > 0 ? (
            <s-stack direction="block" gap="base">
              <s-paragraph>
                <s-text variant="strong">Last {recentMessages.length} messages:</s-text>
              </s-paragraph>
              <s-stack direction="block" gap="tight">
                {recentMessages.map((msg) => (
                  <s-box
                    key={msg.id}
                    padding="tight"
                    borderWidth="base"
                    borderRadius="base"
                    background="base"
                  >
                    <s-stack direction="block" gap="tight">
                      <s-stack direction="inline" gap="base" alignment="space-between">
                        <s-text variant="strong">
                          {msg.channel === "dm" ? "💬 DM" : "💭 Comment"}
                        </s-text>
                        <s-text variant="subdued">
                          {new Date(msg.created_at).toLocaleString()}
                        </s-text>
                      </s-stack>
                      <s-text variant="subdued">
                        {msg.text || "(No text)"}
                      </s-text>
                      {msg.ai_intent && (
                        <s-stack direction="inline" gap="tight">
                          <s-badge tone="info">Intent: {msg.ai_intent}</s-badge>
                          {msg.ai_confidence && (
                            <s-badge tone="subdued">
                              Confidence: {(msg.ai_confidence * 100).toFixed(0)}%
                            </s-badge>
                          )}
                        </s-stack>
                      )}
                      {msg.reply_text ? (
                        <s-box
                          padding="tight"
                          borderWidth="base"
                          borderRadius="base"
                          background={msg.reply_source === "sent" ? "success-subdued" : "info-subdued"}
                        >
                          <s-stack direction="block" gap="tight">
                            <s-text variant="strong" tone={msg.reply_source === "sent" ? "success" : "info"}>
                              {msg.reply_source === "sent" ? "✅ AI Response Sent:" : "💡 AI Response Preview:"}
                            </s-text>
                            <s-text variant="subdued" className="srPreWrap">
                              {msg.reply_text}
                            </s-text>
                          </s-stack>
                        </s-box>
                      ) : (
                        <s-box
                          padding="tight"
                          borderWidth="base"
                          borderRadius="base"
                          background="subdued"
                        >
                          <s-stack direction="block" gap="tight">
                            <s-text variant="strong">
                              ⚠️ No Response Sent:
                            </s-text>
                            <s-text variant="subdued">
                              {(() => {
                                // Check if message was just created (within last 10 seconds) - might still be processing
                                const messageAge = (Date.now() - new Date(msg.created_at).getTime()) / 1000;
                                const isRecent = messageAge < 10;
                                
                                if (isRecent && !msg.ai_intent) {
                                  return "Processing... (AI classification in progress)";
                                }
                                const productSpecificIntents = ["purchase", "product_question", "variant_inquiry", "price_request"];
                                const generalIntents = ["store_question"];
                                const allEligibleIntents = [...productSpecificIntents, ...generalIntents];
                                
                                if (isRecent && msg.ai_intent && allEligibleIntents.includes(msg.ai_intent)) {
                                  return "Processing... (Automation may still be running)";
                                }

                                // Direct DMs with product-specific intent have no product context.
                                // PRO can ask for clarification; non-PRO should not respond.
                                if (msg.channel === "dm" && productSpecificIntents.includes(msg.ai_intent)) {
                                  if (plan?.followup === true) {
                                    return "Would ask a clarifying question (PRO tier) to determine which product the customer means.";
                                  }
                                  return `Direct DM without product context — no response on ${plan?.name || "current"} plan.`;
                                }
                                
                                // Not recent, so show actual reason
                                if (!msg.ai_intent) {
                                  return "Message not classified (AI processing may have failed)";
                                }
                                if (!allEligibleIntents.includes(msg.ai_intent)) {
                                  return `Intent "${msg.ai_intent}" not eligible for automation`;
                                }
                                if (msg.ai_confidence && msg.ai_confidence < 0.7) {
                                  return `Confidence too low (${(msg.ai_confidence * 100).toFixed(0)}% < 70% threshold)`;
                                }
                                return "Automation did not send response (check server logs for details)";
                              })()}
                            </s-text>
                          </s-stack>
                        </s-box>
                      )}
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            </s-stack>
          ) : (
            <s-paragraph>
              <s-text variant="subdued">No messages yet. Send a test webhook above to see results here.</s-text>
            </s-paragraph>
          )}
        </s-box>
      </s-section>

      <s-section heading="Test Instagram API Calls (For Meta Review)">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text>
              Use these sections to test Instagram API calls required for Meta app review.
              These demonstrate that your app uses the <s-text variant="strong">instagram_business_manage_comments</s-text> and <s-text variant="strong">instagram_business_manage_messages</s-text> permissions.
            </s-text>
          </s-paragraph>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="info-subdued">
            <s-stack direction="block" gap="base">
              <s-heading level="3">Test Comments API (instagram_business_manage_comments)</s-heading>
              <s-paragraph>
                <s-text variant="subdued">
                  Tests reading comments on Instagram posts:
                  <br />
                  1. {"GET /{ig-business-id}/media"} – Get Instagram posts
                  <br />
                  2. {"GET /{media-id}/comments"} – Read comments on a post
                  <br />
                  3. {"GET /{comment-id}"} – Get comment details
                </s-text>
              </s-paragraph>
              <s-button
                variant="primary"
                onClick={async () => {
                  try {
                    const response = await fetch("/meta/test-comments-api");
                    const data = await response.json();
                    alert(JSON.stringify(data, null, 2));
                    console.log("Comments API Test Results:", data);
                  } catch (error) {
                    alert(`Error: ${error.message}`);
                    console.error("Comments API Test Error:", error);
                  }
                }}
              >
                Test Comments API
              </s-button>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="info-subdued">
            <s-stack direction="block" gap="base">
              <s-heading level="3">Test Messages API (instagram_business_manage_messages)</s-heading>
              <s-paragraph>
                <s-text variant="subdued">
                  Tests accessing Instagram Messaging API:
                  <br />
                  1. {"GET /{ig-business-id}"} – Get Instagram Business account info
                  <br />
                  2. {"POST /{ig-business-id}/messages"} – Send DM (demonstrated via webhook automation above)
                  <br />
                  <br />
                  Note: Actual message sending happens when you use the "Send Test Webhook" button above with a Direct DM or Comment → DM scenario. That triggers the POST /{ig-business-id}/messages API call.
                </s-text>
              </s-paragraph>
              <s-button
                variant="primary"
                onClick={async () => {
                  try {
                    const response = await fetch("/meta/test-messages-api");
                    const data = await response.json();
                    alert(JSON.stringify(data, null, 2));
                    console.log("Messages API Test Results:", data);
                  } catch (error) {
                    alert(`Error: ${error.message}`);
                    console.error("Messages API Test Error:", error);
                  }
                }}
              >
                Test Messages API
              </s-button>
            </s-stack>
          </s-box>

          <s-paragraph>
            <s-text variant="subdued" className="srItalic">
              Results will be displayed in an alert and logged to the console. These API calls demonstrate to Meta reviewers that your app uses the required permissions.
            </s-text>
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary({ error }) {
  return boundary.error(error);
}

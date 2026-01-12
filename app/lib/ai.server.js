/**
 * AI Module for Message Classification
 * Handles OpenAI API calls with rate limiting and retry logic
 */

import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.warn("[ai] OPENAI_API_KEY not set - AI classification will be disabled");
}

// Initialize OpenAI client
const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
    })
  : null;

/**
 * Rate limiting: Track requests per shop to avoid exceeding API limits
 * Simple in-memory rate limiter (for production, consider Redis)
 */
const rateLimitMap = new Map();

/**
 * Check if shop has exceeded rate limit
 * @param {string} shopId - Shop ID
 * @param {number} maxRequests - Maximum requests per minute
 * @returns {boolean} - True if within limit, false if exceeded
 */
function checkRateLimit(shopId, maxRequests = 60) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window

  if (!rateLimitMap.has(shopId)) {
    rateLimitMap.set(shopId, []);
  }

  const requests = rateLimitMap.get(shopId);
  
  // Remove requests outside the time window
  const recentRequests = requests.filter((timestamp) => now - timestamp < windowMs);
  rateLimitMap.set(shopId, recentRequests);

  if (recentRequests.length >= maxRequests) {
    return false; // Rate limit exceeded
  }

  // Add current request
  recentRequests.push(now);
  return true; // Within limit
}

/**
 * Retry logic for OpenAI API calls
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delayMs - Initial delay in milliseconds
 * @returns {Promise} - Result of the function
 */
async function retryWithBackoff(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain errors (authentication, invalid request)
      if (error.status === 401 || error.status === 400) {
        throw error;
      }
      
      // If it's a rate limit error, wait longer
      if (error.status === 429) {
        const retryAfter = error.headers?.["retry-after"] 
          ? parseInt(error.headers["retry-after"]) * 1000 
          : delayMs * Math.pow(2, attempt);
        
        console.warn(`[ai] Rate limit hit, retrying after ${retryAfter}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter));
        continue;
      }
      
      // For other errors, use exponential backoff
      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt);
        console.warn(`[ai] API call failed, retrying after ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Classify a message using OpenAI
 * @param {string} text - Message text to classify
 * @param {Object} context - Additional context (optional)
 * @returns {Promise<Object>} - Classification result with intent, confidence, sentiment, entities
 */
export async function classifyMessage(text, context = {}) {
  if (!openai) {
    console.warn("[ai] OpenAI client not initialized - skipping classification");
    return {
      intent: null,
      confidence: null,
      sentiment: null,
      entities: null,
      error: "OpenAI API key not configured",
    };
  }

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    console.warn("[ai] Empty or invalid text provided for classification");
    return {
      intent: "not_relevant",
      confidence: 0.0,
      sentiment: "neutral",
      entities: {},
    };
  }

  // Check rate limit (per shop if shopId provided in context)
  const shopId = context.shopId || "global";
  if (!checkRateLimit(shopId)) {
    console.warn(`[ai] Rate limit exceeded for shop ${shopId}`);
    return {
      intent: null,
      confidence: null,
      sentiment: null,
      entities: null,
      error: "Rate limit exceeded",
    };
  }

  const prompt = `You are analyzing an Instagram message or comment from a customer to a business. Classify the message and extract relevant information.

Message: "${text}"

Respond with ONLY a valid JSON object (no markdown, no code blocks) with the following structure:
{
  "intent": "purchase" | "product_question" | "variant_inquiry" | "price_request" | "store_question" | "clarification_needed" | "not_relevant",
  "confidence": 0.0-1.0,
  "sentiment": "positive" | "neutral" | "negative",
  "entities": {
    "size": "string or null",
    "color": "string or null",
    "product_name": "string or null"
  }
}

Intent meanings:
- "purchase": Customer wants to buy something, is ready to purchase, or expresses strong interest/enthusiasm that suggests purchase intent (e.g., "love this!", "I need this", "want this", "this is amazing")
- "product_question": Customer is asking about a specific product (features, details, etc.) - requires product context
- "variant_inquiry": Customer is asking about specific variants (size, color, etc.) - requires product context
- "price_request": Customer is asking about pricing for a specific product - requires product context
- "store_question": Customer is asking about the store in general (return policy, shipping, sales, store hours, general policies, etc.) - does NOT require a specific product
- "clarification_needed": Customer needs more information to proceed
- "not_relevant": Message is not related to products or purchasing

Confidence: How confident you are in the classification (0.0 = not confident, 1.0 = very confident)
Sentiment: Overall tone of the message
Entities: Extract any product details mentioned (size, color, product name)`;

  try {
    const response = await retryWithBackoff(async () => {
      return await openai.chat.completions.create({
        model: "gpt-4o-mini", // Using gpt-4o-mini for cost efficiency
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that classifies customer messages. Always respond with valid JSON only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent classifications
        max_tokens: 200,
        response_format: { type: "json_object" }, // Force JSON response
      });
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse JSON response
    let classification;
    try {
      classification = JSON.parse(content);
    } catch (parseError) {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        classification = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`Failed to parse JSON response: ${parseError.message}`);
      }
    }

    // Validate and normalize classification
    const validIntents = [
      "purchase",
      "product_question",
      "variant_inquiry",
      "price_request",
      "store_question",
      "clarification_needed",
      "not_relevant",
    ];
    const validSentiments = ["positive", "neutral", "negative"];

    const result = {
      intent: validIntents.includes(classification.intent)
        ? classification.intent
        : "not_relevant",
      confidence: Math.max(0.0, Math.min(1.0, classification.confidence || 0.5)),
      sentiment: validSentiments.includes(classification.sentiment)
        ? classification.sentiment
        : "neutral",
      entities: {
        size: classification.entities?.size || null,
        color: classification.entities?.color || null,
        product_name: classification.entities?.product_name || null,
      },
    };

    console.log(`[ai] Classification result:`, result);
    return result;
  } catch (error) {
    console.error("[ai] Error classifying message:", error);
    
    // Return fallback classification on error
    return {
      intent: null,
      confidence: null,
      sentiment: null,
      entities: null,
      error: error.message || "AI classification failed",
    };
  }
}

/**
 * Classify a message and update the database
 * This is a convenience function that combines classification and database update
 * @param {string} messageId - Message ID in database
 * @param {string} text - Message text
 * @param {Object} context - Additional context
 * @param {Function} updateFn - Function to update message in database (from db.server.js)
 * @returns {Promise<Object>} - Classification result
 */
export async function classifyAndUpdateMessage(messageId, text, context, updateFn) {
  try {
    const classification = await classifyMessage(text, context);
    
    // Update message in database if update function provided
    if (updateFn && classification.intent !== null) {
      await updateFn(messageId, classification.intent, classification.confidence, classification.sentiment);
    }
    
    return classification;
  } catch (error) {
    console.error("[ai] Error in classifyAndUpdateMessage:", error);
    return {
      intent: null,
      confidence: null,
      sentiment: null,
      entities: null,
      error: error.message,
    };
  }
}



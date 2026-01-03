/**
 * Centralized Error Handler for DM-to-Buy
 * Logs errors with context (shop_id, timestamp, error type) for debugging
 */

import supabase from "./supabase.server";

/**
 * Error types
 */
export const ErrorType = {
  SHOPIFY: "shopify",
  META: "meta",
  OPENAI: "openai",
  DATABASE: "database",
  AUTOMATION: "automation",
  GENERAL: "general",
};

/**
 * Log an error with context
 * @param {string} errorType - Type of error (from ErrorType enum)
 * @param {Error|string} error - Error object or error message
 * @param {Object} context - Additional context (shopId, messageId, etc.)
 */
export async function logError(errorType, error, context = {}) {
  const errorMessage = error instanceof Error ? error.message : error;
  const errorStack = error instanceof Error ? error.stack : null;

  const logData = {
    error_type: errorType,
    error_message: errorMessage,
    error_stack: errorStack,
    shop_id: context.shopId || null,
    message_id: context.messageId || null,
    context: JSON.stringify(context),
    timestamp: new Date().toISOString(),
  };

  // Log to console
  console.error(`[error-handler] ${errorType.toUpperCase()} Error:`, errorMessage);
  if (context.shopId) {
    console.error(`[error-handler] Shop ID: ${context.shopId}`);
  }
  if (errorStack) {
    console.error(`[error-handler] Stack:`, errorStack);
  }
  if (Object.keys(context).length > 0) {
    console.error(`[error-handler] Context:`, context);
  }

  // Try to log to database (if error_logs table exists)
  // For now, we'll just log to console
  // TODO: Create error_logs table in Supabase if needed
  try {
    // Uncomment when error_logs table is created:
    // await supabase.from("error_logs").insert(logData);
  } catch (dbError) {
    // If database logging fails, just continue
    console.error("[error-handler] Failed to log error to database:", dbError);
  }
}

/**
 * Handle critical errors that require notification
 * @param {string} errorType - Type of error
 * @param {Error|string} error - Error object or message
 * @param {Object} context - Additional context
 */
export async function handleCriticalError(errorType, error, context = {}) {
  await logError(errorType, error, context);

  // Critical errors that need immediate attention:
  const criticalErrors = [
    "token expired",
    "invalid token",
    "rate limit exceeded",
    "api rate limit",
  ];

  const errorMessage = error instanceof Error ? error.message : error;
  const isCritical = criticalErrors.some((critical) =>
    errorMessage.toLowerCase().includes(critical)
  );

  if (isCritical) {
    console.error(`[error-handler] ⚠️ CRITICAL ERROR: ${errorMessage}`);
    // TODO: Send notification (email, Slack, etc.) for critical errors
  }
}

/**
 * Wrapper for async functions to catch and log errors
 * @param {Function} fn - Async function to wrap
 * @param {string} errorType - Type of error if function fails
 * @param {Object} context - Context to include in error log
 */
export function withErrorHandling(fn, errorType = ErrorType.GENERAL, context = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      await logError(errorType, error, context);
      throw error; // Re-throw to allow caller to handle
    }
  };
}


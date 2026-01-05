/**
 * Meta Data Deletion Callback
 * 
 * This endpoint is called by Meta when a user requests deletion of their data.
 * Meta will send a POST request with the user's signed_request containing:
 * - user_id: The Instagram user ID requesting deletion
 * - algorithm: The algorithm used to sign the request
 * 
 * Requirements:
 * 1. Verify the signed_request from Meta
 * 2. Delete all data associated with the user_id
 * 3. Return a confirmation URL that Meta will show to the user
 * 
 * Reference: https://developers.facebook.com/docs/apps/delete-data
 */

import crypto from "crypto";

const META_APP_SECRET = process.env.META_APP_SECRET;

/**
 * Verify and decode the signed_request from Meta
 */
function parseSignedRequest(signedRequest) {
  if (!META_APP_SECRET) {
    throw new Error("META_APP_SECRET is not configured");
  }

  const [signature, payload] = signedRequest.split(".");
  
  // Decode the payload
  const decodedPayload = JSON.parse(
    Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
  );

  // Verify the signature
  const expectedSignature = crypto
    .createHmac("sha256", META_APP_SECRET)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  if (signature !== expectedSignature) {
    throw new Error("Invalid signature");
  }

  return decodedPayload;
}

/**
 * Delete all data associated with an Instagram user ID
 */
async function deleteUserData(igUserId) {
  const supabase = (await import("../lib/supabase.server")).default;

  try {
    // Find all messages from this user
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id, shop_id")
      .eq("from_user_id", igUserId);

    if (messagesError) {
      console.error("[data-deletion] Error fetching messages:", messagesError);
      throw messagesError;
    }

    const messageIds = (messages || []).map(m => m.id);
    const shopIds = [...new Set((messages || []).map(m => m.shop_id))];

    // Delete links_sent associated with these messages
    if (messageIds.length > 0) {
      const { error: linksError } = await supabase
        .from("links_sent")
        .delete()
        .in("message_id", messageIds);

      if (linksError) {
        console.error("[data-deletion] Error deleting links_sent:", linksError);
      }
    }

    // Delete followups associated with these messages
    if (messageIds.length > 0) {
      const { error: followupsError } = await supabase
        .from("followups")
        .delete()
        .in("message_id", messageIds);

      if (followupsError) {
        console.error("[data-deletion] Error deleting followups:", followupsError);
      }
    }

    // Delete clicks associated with links from these messages
    if (messageIds.length > 0) {
      // Get link_ids from links_sent
      const { data: linksSent } = await supabase
        .from("links_sent")
        .select("link_id")
        .in("message_id", messageIds);

      const linkIds = (linksSent || []).map(l => l.link_id).filter(Boolean);

      if (linkIds.length > 0) {
        const { error: clicksError } = await supabase
          .from("clicks")
          .delete()
          .in("link_id", linkIds);

        if (clicksError) {
          console.error("[data-deletion] Error deleting clicks:", clicksError);
        }
      }
    }

    // Delete attribution records associated with these links
    if (messageIds.length > 0) {
      const { data: linksSent } = await supabase
        .from("links_sent")
        .select("link_id")
        .in("message_id", messageIds);

      const linkIds = (linksSent || []).map(l => l.link_id).filter(Boolean);

      if (linkIds.length > 0) {
        const { error: attributionError } = await supabase
          .from("attribution")
          .delete()
          .in("link_id", linkIds);

        if (attributionError) {
          console.error("[data-deletion] Error deleting attribution:", attributionError);
        }
      }
    }

    // Delete the messages themselves
    if (messageIds.length > 0) {
      const { error: messagesDeleteError } = await supabase
        .from("messages")
        .delete()
        .in("id", messageIds);

      if (messagesDeleteError) {
        console.error("[data-deletion] Error deleting messages:", messagesDeleteError);
        throw messagesDeleteError;
      }
    }

    console.log(`[data-deletion] Successfully deleted data for user ${igUserId}`);
    return {
      success: true,
      deletedMessages: messageIds.length,
      affectedShops: shopIds.length,
    };
  } catch (error) {
    console.error("[data-deletion] Error deleting user data:", error);
    throw error;
  }
}

/**
 * POST handler for data deletion requests from Meta
 */
export const action = async ({ request }) => {
  console.log("[data-deletion] Meta data deletion request received");

  try {
    const formData = await request.formData();
    const signedRequest = formData.get("signed_request");

    if (!signedRequest) {
      console.error("[data-deletion] Missing signed_request");
      return new Response(
        JSON.stringify({
          url: `${process.env.SHOPIFY_APP_URL || "https://socialrepl.ai"}/privacy`,
          confirmation_code: "ERROR_MISSING_REQUEST",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Parse and verify the signed request
    let payload;
    try {
      payload = parseSignedRequest(signedRequest);
    } catch (error) {
      console.error("[data-deletion] Invalid signed_request:", error);
      return new Response(
        JSON.stringify({
          url: `${process.env.SHOPIFY_APP_URL || "https://socialrepl.ai"}/privacy`,
          confirmation_code: "ERROR_INVALID_REQUEST",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const userId = payload.user_id;

    if (!userId) {
      console.error("[data-deletion] Missing user_id in payload");
      return new Response(
        JSON.stringify({
          url: `${process.env.SHOPIFY_APP_URL || "https://socialrepl.ai"}/privacy`,
          confirmation_code: "ERROR_MISSING_USER_ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[data-deletion] Processing deletion request for user ${userId}`);

    // Delete the user's data
    const result = await deleteUserData(userId);

    // Return confirmation to Meta
    // Meta will show the confirmation_code to the user
    return new Response(
      JSON.stringify({
        url: `${process.env.SHOPIFY_APP_URL || "https://socialrepl.ai"}/privacy`,
        confirmation_code: `DELETED_${userId}_${Date.now()}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[data-deletion] Error processing deletion request:", error);
    return new Response(
      JSON.stringify({
        url: `${process.env.SHOPIFY_APP_URL || "https://socialrepl.ai"}/privacy`,
        confirmation_code: "ERROR_PROCESSING",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

/**
 * GET handler - Meta may send GET requests to verify the endpoint
 */
export const loader = async ({ request }) => {
  return new Response("Data deletion endpoint is active", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
};


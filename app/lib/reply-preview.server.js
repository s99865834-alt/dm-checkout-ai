/**
 * Let a merchant see a real reply before connecting Instagram.
 *
 * Why this exists: connecting is an immediate decision (10 of the 12 merchants
 * who ever connected did it within 4 minutes of installing) and it is the
 * largest thing we ask of a stranger, since it grants access to their customer
 * DMs. Asking for it before showing anything means the merchant is deciding on
 * a promise. On 23 Oct 2026 one merchant connected in under two minutes, ran a
 * single test whose only possible output was a generic "browse everything
 * here" link because a new shop has no post mapping, looked at the pricing
 * page, and disconnected.
 *
 * This runs the real generator, not a scripted demo. If the preview were
 * better than production the merchant would find out later, which is worse
 * than showing nothing.
 *
 * Side effects, deliberately:
 *   generateAgentReply mints tracked links but does not persist them: in the
 *   live path automation.server.js writes links_sent after the DM actually
 *   sends. A preview link therefore resolves to nothing unless we write the
 *   row ourselves, and a dead link is a bad first impression. So we write it,
 *   flagged with PREVIEW_FAILED_REASON. See reply-preview.js for why that
 *   keeps the row out of analytics without breaking the redirect.
 */
import supabase from "./supabase.server";
import { generateAgentReply } from "./sales-agent.server";
import { PREVIEW_FAILED_REASON } from "./reply-preview";
import logger from "./logger.server";

/**
 * Generate a reply the merchant can read, and make its links clickable.
 *
 * @param {Object} args
 * @param {Object} args.shop - shops row (needs id and shopify_domain)
 * @param {Object|null} args.brandVoice - brand_voice row, so the preview
 *   reflects any tone they have already set
 * @param {string} args.text - the customer message to answer
 * @returns {Promise<{text: string, links: Array}|null>} null when the agent
 *   declines (disabled, or nothing to answer)
 */
export async function generateReplyPreview({ shop, brandVoice, text }) {
  if (!shop?.id || !shop?.shopify_domain) return null;
  const message = (text || "").trim();
  if (!message) return null;

  const result = await generateAgentReply({
    shop,
    // id null marks this as not belonging to a real inbound message, which is
    // what keeps it out of the "responded" half of shop_analytics_totals.
    message: { id: null, text: message, ai_entities: null },
    intent: null,
    brandVoice: brandVoice || null,
    // No thread: a preview is always the first message in a conversation.
    threadContext: null,
    allowClarify: true,
  });

  if (!result?.text) return null;

  const links = (result.links || []).filter((l) => l?.linkId && l?.url);
  if (links.length > 0) {
    const rows = links.map((l) => ({
      shop_id: shop.id,
      message_id: null,
      product_id: l.productId || null,
      variant_id: l.variantId || null,
      url: l.url,
      link_id: l.linkId,
      reply_text: null,
      failed_reason: PREVIEW_FAILED_REASON,
    }));
    const { error } = await supabase.from("links_sent").insert(rows);
    if (error) {
      // The reply is still worth showing; only the link would 404.
      logger.debug(`[reply-preview] Could not persist preview links: ${error.message}`);
    }
  }

  return { text: result.text, links };
}

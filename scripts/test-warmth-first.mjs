/**
 * Dry-run for the warmth-first compliment reply. No sends, no DB writes —
 * just calls generateReplyMessage the same way handleIncomingComment does
 * and prints the reply. Run:
 *   npx vite-node -c scripts/vite-node.config.mjs scripts/test-warmth-first.mjs
 */
import { generateReplyMessage } from "../app/lib/automation.server";

const brandVoice = { tone: "friendly", custom_instruction: null, reply_language: "auto" };
const checkoutUrl = "https://example-store.com/cart/12345:1?ref=srai";

const cases = [
  { label: "Fire emojis", text: "🔥🔥🔥🔥" },
  { label: "Compliment", text: "This is awesome!! You made my childhood" },
  { label: "Explicit ask (control — should stay direct)", text: "How much is this? I want one" },
];

for (const c of cases) {
  const reply = await generateReplyMessage(
    brandVoice,
    "Transformers G1 Art Print",
    checkoutUrl,
    "purchase",
    "$45.00",
    null,
    c.text,
    null,
    {
      originChannel: "comment",
      inboundChannel: "comment",
      triggerChannel: "comment",
      lastProductLink: { url: checkoutUrl, product_id: "1", variant_id: "1", trigger_channel: "comment" },
      recentMessages: [{ channel: "comment", text: c.text, created_at: new Date().toISOString() }],
    }
  );
  console.log(`\n=== ${c.label}: "${c.text}" ===\n${reply}`);
}

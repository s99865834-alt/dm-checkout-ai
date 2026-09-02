/**
 * Counting outbound replies from links_sent rows.
 *
 * Pure and dependency-free on purpose: db.server.js pulls in Supabase and
 * Shopify credentials at import time, which CI doesn't have, so the counting
 * rules live here where they can be tested directly.
 *
 * The shape of the table is the reason this needs care. A single reply writes
 * more than one row:
 *
 *   - a claim row (`dm_reply_comment_*` / `dm_reply_ext_*` / `size_q_*`),
 *     inserted before the send so it reserves the one private reply Instagram
 *     allows per comment and collapses duplicate webhooks
 *   - one row per link the reply carried, and a product answer can carry both
 *     a checkout link and a product-page link
 *
 * So counting rows counted one reply as two or three. The admin dashboard read
 * about 1.7x the truth for months because of it.
 */

/**
 * Delivered and undelivered reply counts per shop.
 *
 * @param {Array<{shop_id: string, message_id: string|null, failed_reason: string|null}>} rows
 * @returns {{delivered: Map<string, number>, undelivered: Map<string, number>}}
 */
export function countRepliesByShop(rows) {
  const messagesByShop = new Map();
  const undelivered = new Map();

  for (const row of rows || []) {
    const id = row?.shop_id;
    if (!id) continue;

    // A rejected send keeps its claim row, because the claim is what stops us
    // retrying into a double-reply. It must not read as a delivered message.
    if (row.failed_reason) {
      undelivered.set(id, (undelivered.get(id) || 0) + 1);
      continue;
    }

    // Rows with no message_id can't be tied back to a reply, and the few that
    // exist are second links on a reply already counted through its claim row.
    if (!row.message_id) continue;

    if (!messagesByShop.has(id)) messagesByShop.set(id, new Set());
    messagesByShop.get(id).add(row.message_id);
  }

  const delivered = new Map();
  messagesByShop.forEach((set, id) => delivered.set(id, set.size));

  return { delivered, undelivered };
}

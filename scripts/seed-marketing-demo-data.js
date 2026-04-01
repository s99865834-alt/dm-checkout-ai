/**
 * Inserts realistic analytics demo data for a single shop (marketing screenshots).
 * All rows are tagged with a batch id and listed in scripts/.marketing-seed-state.json
 * for a clean revert via scripts/revert-marketing-demo-data.js
 *
 * Run from repo root:
 *   node --env-file=.env scripts/seed-marketing-demo-data.js
 *
 * Optional env:
 *   MARKETING_SEED_SHOP_DOMAIN=dmteststore-2.myshopify.com (default)
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, ".marketing-seed-state.json");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const shopDomain =
  process.env.MARKETING_SEED_SHOP_DOMAIN || "dmteststore-2.myshopify.com";

if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const BATCH = `mkt_${Date.now()}_${randomBytes(3).toString("hex")}`;

const INTENTS = [
  "purchase_intent",
  "product_question",
  "size_inquiry",
  "shipping_inquiry",
  "general_question",
  "restock_request",
];

const DM_SAMPLES = [
  "Do you have this in medium?",
  "How much is shipping to Austin?",
  "Link to checkout please 🙏",
  "Is this restocking soon?",
  "What size should I get if I'm usually a 6?",
];

const COMMENT_SAMPLES = [
  "Price?",
  "Available in black?",
  "Love this — link?",
  "Ship to UK?",
  "🖤 need this",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sentimentForIndex(i) {
  if (i % 10 < 6) return "positive";
  if (i % 10 < 9) return "neutral";
  return "negative";
}

/** Deterministic pseudo-ISO spread over the last `spanDays` days */
function createdAtForIndex(i, total, spanDays = 45) {
  const dayFrac = i / Math.max(total - 1, 1);
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.floor((1 - dayFrac) * spanDays));
  d.setUTCHours(8 + (i % 12), (i * 7) % 60, (i * 13) % 60, 0);
  return d.toISOString();
}

async function run() {
  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("id, shopify_domain, plan")
    .eq("shopify_domain", shopDomain)
    .single();

  if (shopErr || !shop) {
    console.error("Shop not found:", shopDomain, shopErr?.message);
    process.exit(1);
  }

  const shopId = shop.id;
  console.log(`Seeding demo analytics for ${shop.shopify_domain} (${shopId}) batch=${BATCH}`);

  const state = {
    batch: BATCH,
    shopify_domain: shopDomain,
    shop_id: shopId,
    created_at: new Date().toISOString(),
    message_ids: [],
    links_sent_ids: [],
    link_ids: [],
    click_ids: [],
    attribution_ids: [],
    followup_ids: [],
  };

  const NUM_MESSAGES = 185;
  const RESPONSE_RATE = 0.88;
  const CTR_TARGET = 0.42;
  const ATTRIBUTION_COUNT = 38;
  const FOLLOWUP_FRACTION = 0.28;

  const rowsToCreate = [];
  for (let i = 0; i < NUM_MESSAGES; i++) {
    const channel = i % 3 === 0 ? "comment" : "dm";
    const text = channel === "dm" ? pick(DM_SAMPLES) : pick(COMMENT_SAMPLES);
    const created = createdAtForIndex(i, NUM_MESSAGES);
    rowsToCreate.push({
      shop_id: shopId,
      channel,
      external_id: `${BATCH}_ext_${i}`,
      from_user_id: `ig_demo_${(i % 94) + 10000}`,
      from_username: `demo_user_${(i % 94) + 1}`,
      text,
      ai_intent: pick(INTENTS),
      ai_confidence: 0.72 + (i % 20) / 100,
      sentiment: sentimentForIndex(i),
      last_user_message_at: created,
      created_at: created,
    });
  }

  const { data: insertedMessages, error: msgErr } = await supabase
    .from("messages")
    .insert(rowsToCreate)
    .select("id, channel, created_at");

  if (msgErr) {
    console.error("messages insert:", msgErr);
    process.exit(1);
  }

  state.message_ids = insertedMessages.map((m) => m.id);

  const linkRows = [];
  const messageMeta = new Map(insertedMessages.map((m, idx) => [m.id, { ...m, idx }]));

  for (const m of insertedMessages) {
    const idx = messageMeta.get(m.id).idx;
    const shouldRespond = ((idx * 2654435761) >>> 0) % 100 < Math.floor(RESPONSE_RATE * 100);
    if (!shouldRespond) continue;

    const linkId = `${BATCH}_lnk_${idx}`;
    const productId = idx % 5 === 0 ? `gid://shopify/Product/${8800000 + (idx % 12)}` : null;

    linkRows.push({
      shop_id: shopId,
      message_id: m.id,
      product_id: productId,
      variant_id: null,
      url: `https://${shopDomain.replace(".myshopify.com", "")}.myshopify.com/cart/${linkId}`,
      link_id: linkId,
      reply_text:
        "Here's your link — let me know if you need another size or color!",
      sent_at: m.created_at,
    });
  }

  const { data: insertedLinks, error: linkErr } = await supabase
    .from("links_sent")
    .insert(linkRows)
    .select("id, link_id, message_id, sent_at");

  if (linkErr) {
    console.error("links_sent insert:", linkErr);
    process.exit(1);
  }

  state.links_sent_ids = insertedLinks.map((l) => l.id);
  state.link_ids = insertedLinks.map((l) => l.link_id);

  const numLinks = insertedLinks.length;
  const targetClicks = Math.max(1, Math.round(numLinks * CTR_TARGET));
  const clickInserts = [];
  for (let c = 0; c < targetClicks; c++) {
    const link = insertedLinks[c % insertedLinks.length];
    const t = new Date(link.sent_at);
    t.setUTCMinutes(t.getUTCMinutes() + 5 + (c % 120));
    clickInserts.push({
      link_id: link.link_id,
      user_agent: "Mozilla/5.0 (Marketing demo)",
      ip: `203.0.113.${(c % 200) + 1}`,
    });
  }

  const { data: insertedClicks, error: clickErr } = await supabase
    .from("clicks")
    .insert(clickInserts)
    .select("id");

  if (clickErr) {
    console.error("clicks insert:", clickErr);
    process.exit(1);
  }
  state.click_ids = insertedClicks.map((c) => c.id);

  const shuffledLinks = [...insertedLinks].sort(() => Math.random() - 0.5);
  const attrRows = [];
  for (let a = 0; a < ATTRIBUTION_COUNT; a++) {
    const link = shuffledLinks[a % shuffledLinks.length];
    const msg = insertedMessages.find((m) => m.id === link.message_id);
    const amount = (29.99 + (a % 8) * 12.5).toFixed(2);
    const t = new Date(link.sent_at);
    t.setUTCDate(t.getUTCDate() + 1 + (a % 3));
    attrRows.push({
      shop_id: shopId,
      order_id: `${BATCH}_ord_${a}`,
      link_id: link.link_id,
      channel: msg?.channel || "dm",
      amount,
      currency: "USD",
      created_at: t.toISOString(),
    });
  }

  const { data: insertedAttr, error: attrErr } = await supabase
    .from("attribution")
    .insert(attrRows)
    .select("id");

  if (attrErr) {
    console.error("attribution insert:", attrErr);
    process.exit(1);
  }
  state.attribution_ids = insertedAttr.map((r) => r.id);

  const dmWithLinks = insertedLinks.filter((l) => {
    const msg = insertedMessages.find((m) => m.id === l.message_id);
    return msg?.channel === "dm";
  });
  const followupCount = Math.floor(dmWithLinks.length * FOLLOWUP_FRACTION);
  const followRows = dmWithLinks.slice(0, followupCount).map((l) => ({
    shop_id: shopId,
    message_id: l.message_id,
    link_id: l.link_id,
  }));

  if (followRows.length > 0) {
    const { data: insertedFu, error: fuErr } = await supabase
      .from("followups")
      .insert(followRows)
      .select("id");

    if (fuErr) {
      console.error("followups insert:", fuErr);
      process.exit(1);
    }
    state.followup_ids = insertedFu.map((r) => r.id);
  }

  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");

  console.log("Done.");
  console.log(`  messages:        ${state.message_ids.length}`);
  console.log(`  links_sent:      ${state.links_sent_ids.length}`);
  console.log(`  clicks:          ${state.click_ids.length}`);
  console.log(`  attribution:     ${state.attribution_ids.length}`);
  console.log(`  followups:       ${state.followup_ids.length}`);
  console.log(`State saved to ${STATE_PATH}`);
  console.log(`Revert with: node --env-file=.env scripts/revert-marketing-demo-data.js`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

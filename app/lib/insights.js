// Pro customer insights: what customers ask about, which products get
// interest without sales, and what to do about it.
//
// The model names topics, sorts messages into them, and words suggestions.
// Every number on the card is counted by us, from the database or from the
// per-message assignments, so a label can be vague but a figure cannot be
// invented.
//
// Naming and sorting are separate steps on purpose. Asked to do both at once,
// the model listed two example messages per topic and skipped the rest, so
// the biggest topic in a 400-message sample came back with a count of 2.
// Sorting is by keyword first, in code, and only the messages no keyword
// catches go back to the model.

export const INSIGHTS_WINDOW_DAYS = 30;
// Below this, a summary sounds confident and says nothing.
export const INSIGHTS_MIN_MESSAGES = 20;
export const INSIGHTS_SAMPLE_SIZE = 400;
// The model loses track of which number is which in longer lists: at 100 per
// call, a tenth of the "Cranberry" replies landed in another topic.
export const INSIGHTS_ASSIGN_CHUNK = 40;
export const INSIGHTS_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
export const INSIGHTS_MANUAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const MAX_TOPICS = 6;
export const MAX_ACTIONS = 3;
// Ids kept per topic for quotes and the drill-down list.
export const MAX_TOPIC_IDS = 25;

const TOPIC_KINDS = ["question", "interest", "complaint", "feedback"];
const ACTION_KINDS = ["content", "store", "app"];

// The only app changes an action may suggest, so it never points at a
// setting that does not exist. A discount is deliberately not on this list:
// the model cannot see whether one is already on, so that suggestion is
// worked out from live numbers instead (discountSuggestion).
export const APP_ACTIONS = [
  "Map the post to its product (Home, Your Instagram Posts) so replies link the right item",
  "Adjust tone or custom voice (Home, Automation) so replies answer this the way you would",
  "Set a default product (Home, Your Instagram, Stories) so story replies have something to sell",
];

// A discount is worth suggesting when enough people opened a checkout link
// from a DM for the rate to mean something, and almost none of them bought.
export const DISCOUNT_MIN_OPENED = 10;
export const DISCOUNT_MAX_CONVERSION = 0.05;

const MIN_MESSAGES_FOR_FLAG = 5;
const MIN_CLICKS_FOR_FLAG = 5;

/**
 * True when a shop has no insights yet or its last run is old enough. A
 * not-enough result is rechecked daily, not weekly: it cost no AI call, and a
 * new store crossing the threshold should not wait a week to see anything.
 */
export function isInsightDue(row, now = Date.now()) {
  if (!row?.generated_at) return true;
  const interval = row.status === "ready" ? INSIGHTS_REFRESH_MS : INSIGHTS_MANUAL_COOLDOWN_MS;
  return now - new Date(row.generated_at).getTime() >= interval;
}

/**
 * Merchants can refresh a real summary by hand once a day, so a button cannot
 * run up AI spend. Anything short of a summary can be retried at once.
 */
export function canRefreshManually(row, now = Date.now()) {
  if (!row?.generated_at || row.status !== "ready") return true;
  return now - new Date(row.generated_at).getTime() >= INSIGHTS_MANUAL_COOLDOWN_MS;
}

/**
 * Tag products whose numbers say something worth acting on.
 *   asked_no_clicks  people got a link and nobody opened it
 *   clicks_no_sales  people opened it and nobody bought
 *   selling          at least one attributed order
 */
export function productFlag(p) {
  const messages = Number(p?.messages) || 0;
  const clicked = Number(p?.clicked) || 0;
  const orders = Number(p?.orders) || 0;
  if (orders > 0) return "selling";
  if (clicked >= MIN_CLICKS_FOR_FLAG) return "clicks_no_sales";
  if (messages >= MIN_MESSAGES_FOR_FLAG && clicked === 0) return "asked_no_clicks";
  return null;
}

// Cuts by code point: slicing UTF-16 can split an emoji into a lone
// surrogate, and OpenAI rejects the whole request body as invalid JSON.
export function oneLine(text, max) {
  const clean = String(text || "").replace(/[\uD800-\uDFFF]/gu, "").replace(/\s+/g, " ").trim();
  return Array.from(clean).slice(0, max).join("");
}

function storeLines(store = {}) {
  return `Store: ${oneLine(store.name, 80) || "unknown"}
Shipping policy published: ${store.hasShippingPolicy ? "yes" : "no"}
Return policy published: ${store.hasRefundPolicy ? "yes" : "no"}`;
}

function productLines(products = []) {
  if (!products.length) return "- none";
  return products
    .map(
      (p) =>
        `- ${p.title}: ${p.messages} conversations got a link, ${p.clicked} opened it, ${p.orders} orders` +
        (p.flag ? ` [${p.flag}]` : ""),
    )
    .join("\n");
}

function messageLine(m, i, max) {
  return `[${i}] (${m.channel || "dm"}, ${m.ai_intent || "unknown"}) ${oneLine(m.text, max)}`;
}

/**
 * Short messages that repeat, counted by us. Comment threads are often a
 * crowd answering the same prompt ("Cranberry", "Hourglass"), and a model
 * reading 400 lines misses that without being told.
 */
export function repeatedPhrases(messages, { maxWords = 4, minCount = 3, limit = 10 } = {}) {
  const counts = new Map();
  for (const m of messages) {
    const norm = String(m?.text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s']/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!norm || norm.split(" ").length > maxWords) continue;
    counts.set(norm, (counts.get(norm) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= minCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([phrase, count]) => ({ phrase, count }));
}

/** Step 1: name the topics. No message lists, so nothing to skip. */
export function buildTopicDiscoveryPrompt({ messages, products = [], store = {} }) {
  const repeats = repeatedPhrases(messages);
  return `You help a small online store understand its Instagram DMs and comments from the last ${INSIGHTS_WINDOW_DAYS} days.

${storeLines(store)}

Products customers were sent links to:
${productLines(products)}

Short messages that repeat most:
${repeats.length ? repeats.map((r) => `- "${r.phrase}" (${r.count} times)`).join("\n") : "- none"}

Messages:
${messages.map((m, i) => messageLine(m, i, 160)).join("\n")}

Name the ${MAX_TOPICS} or fewer topics that cover the most messages and that a store owner could act on: a specific product people keep asking about, sizing, shipping, price, restocks, a complaint, or many people answering the same post prompt or giveaway. Prefer topics that many messages share over rare ones. The repeated messages above are usually the biggest topic.

Rules:
- "label": plain words, at most 6, no quotes. Name the actual thing ("Shipping to Canada", "Cranberry and Hourglass answers"), never a generic bucket like "product inquiry", "feedback", or "questions".
- Topics must not overlap. If two would share messages (one word is part of another, or one is a broader version of the other), merge them into one.
- "description": one sentence saying which messages belong, used to sort them later.
- "keywords": up to 6 lowercase words or short phrases that, when a message contains them, mean it belongs here ("cranberry", "ship to canada"). Leave empty when the topic has no telltale words. No keyword may belong to two topics.
- "summary": one short sentence describing what these customers said or want. Describe them, do not give advice.
- Never write counts, percentages, or totals.
- Do not invent products, policies, or facts not in the data.

Respond with ONLY this JSON:
{"topics": [{"label": "string", "kind": "question" | "interest" | "complaint" | "feedback", "description": "string", "keywords": ["string"], "summary": "string"}]}`;
}

function normalizeForMatch(text) {
  return ` ${String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

export function parseDiscoveredTopics(raw) {
  const topics = Array.isArray(raw?.topics) ? raw.topics : [];
  const out = [];
  const seenKeywords = new Set();
  for (const t of topics) {
    const label = oneLine(t?.label, 60);
    if (!label) continue;
    const keywords = [];
    for (const k of Array.isArray(t?.keywords) ? t.keywords : []) {
      const norm = normalizeForMatch(k).trim();
      // Two letters matches inside too many unrelated words to be a signal.
      if (norm.length < 3 || seenKeywords.has(norm)) continue;
      seenKeywords.add(norm);
      keywords.push(norm);
      if (keywords.length >= 6) break;
    }
    out.push({
      label,
      kind: TOPIC_KINDS.includes(t?.kind) ? t.kind : "question",
      description: oneLine(t?.description, 200),
      keywords,
      summary: oneLine(t?.summary, 160),
    });
    if (out.length >= MAX_TOPICS) break;
  }
  return out;
}

/**
 * Sort messages by the topics' keywords, whole words only, so "berry" never
 * claims "cranberry". A message matching several topics goes to the one with
 * the longest matching keyword. -1 means no keyword hit; the model sorts those.
 */
export function assignByKeywords(topics, messages) {
  return messages.map((m) => {
    const text = normalizeForMatch(m?.text);
    let best = -1;
    let bestLen = 0;
    topics.forEach((t, ti) => {
      for (const k of t.keywords || []) {
        if (k.length > bestLen && text.includes(` ${k} `)) {
          best = ti;
          bestLen = k.length;
        }
      }
    });
    return best;
  });
}

/** Step 2: sort one chunk of messages into the named topics. */
export function buildAssignmentPrompt(topics, chunk) {
  return `Sort each customer message into one topic, or -1 if none fits well. Go by what the message actually says; when a message names a word or product, use the topic that names that exact word or product.

Topics:
${topics.map((t, i) => `${i}. ${t.label}: ${t.description}`).join("\n")}

Messages:
${chunk.map((m, i) => messageLine(m, i, 220)).join("\n")}

Respond with ONLY this JSON, keyed by message number, with a key for every message from 0 to ${chunk.length - 1}:
{"assignments": {"0": 2, "1": -1, "2": 0}}`;
}

/**
 * One topic index per message in the chunk. Keyed by message number rather
 * than position: positional lists came back 97 to 101 long for 100 messages,
 * which shifts every answer after the first slip. Missing keys become -1.
 */
export function parseAssignments(raw, chunkLength, topicCount) {
  const map = raw?.assignments && typeof raw.assignments === "object" && !Array.isArray(raw.assignments)
    ? raw.assignments
    : {};
  return Array.from({ length: chunkLength }, (_, i) => {
    const n = Number(map[String(i)]);
    return Number.isInteger(n) && n >= 0 && n < topicCount ? n : -1;
  });
}

/**
 * Card topics from the assignments: counted by us, topics with fewer than two
 * messages dropped, largest first.
 */
export function buildTopics(discovered, assignments, messages) {
  const buckets = discovered.map(() => []);
  assignments.forEach((t, i) => {
    if (t >= 0 && buckets[t] && messages[i]) buckets[t].push(messages[i].id);
  });
  return discovered
    .map((t, i) => ({
      label: t.label,
      kind: t.kind,
      summary: t.summary,
      count: buckets[i].length,
      messageIds: buckets[i].slice(0, MAX_TOPIC_IDS),
    }))
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count);
}

/** Step 3: suggestions, given the real counts. */
export function buildActionsPrompt({ topics, products = [], store = {} }) {
  return `You help a small online store act on its Instagram DMs and comments from the last ${INSIGHTS_WINDOW_DAYS} days.

${storeLines(store)}

What customers talked about:
${topics.length ? topics.map((t, i) => `${i}. ${t.label} (${t.count} messages): ${t.summary}`).join("\n") : "- nothing stood out"}

Products customers were sent links to:
${productLines(products)}

Suggest at most ${MAX_ACTIONS} concrete actions with the biggest payoff, each tied to a topic or product above. Good actions are specific: a post or story to make, a policy or product page to fix, or one of these app changes, worded exactly:
${APP_ACTIONS.map((a) => `- ${a}`).join("\n")}

Rules:
- "title": short and specific. "detail": one sentence.
- "topic": the topic number it comes from, or null if it comes from a product.
- Never write counts, percentages, or totals. The app shows the real numbers.
- Do not invent products, policies, or facts not in the data.

Respond with ONLY this JSON:
{"actions": [{"title": "string", "detail": "string", "kind": "content" | "store" | "app", "topic": 0}]}`;
}

/** Actions from the model, with topic references checked against the card. */
export function parseInsightActions(raw, topics) {
  const actions = Array.isArray(raw?.actions) ? raw.actions : [];
  const out = [];
  for (const a of actions) {
    const title = oneLine(a?.title, 120);
    if (!title) continue;
    const ref = Number.isInteger(a?.topic) && a.topic >= 0 && a.topic < topics.length ? a.topic : null;
    out.push({
      title,
      detail: oneLine(a?.detail, 220),
      kind: ACTION_KINDS.includes(a?.kind) ? a.kind : "content",
      topic: ref,
    });
    if (out.length >= MAX_ACTIONS) break;
  }
  return out;
}

/**
 * All three steps. `ask(prompt, maxTokens)` resolves to parsed JSON or null.
 * A failed chunk only leaves its messages unsorted; a failed first step means
 * no topics at all, reported as aiFailed so the card can say so.
 */
export async function runInsightPipeline({ messages, products, store, ask }) {
  const discovered = parseDiscoveredTopics(
    await ask(buildTopicDiscoveryPrompt({ messages, products, store }), 800),
  );
  if (!discovered.length) return { topics: [], actions: [], aiFailed: true };

  const assignments = assignByKeywords(discovered, messages);
  const leftover = messages.map((_, i) => i).filter((i) => assignments[i] === -1);
  const chunks = [];
  for (let i = 0; i < leftover.length; i += INSIGHTS_ASSIGN_CHUNK) {
    chunks.push(leftover.slice(i, i + INSIGHTS_ASSIGN_CHUNK));
  }
  await Promise.all(
    chunks.map(async (idxs) => {
      const chunk = idxs.map((i) => messages[i]);
      const result = parseAssignments(
        await ask(buildAssignmentPrompt(discovered, chunk), 500),
        chunk.length,
        discovered.length,
      );
      idxs.forEach((msgIndex, j) => {
        assignments[msgIndex] = result[j];
      });
    }),
  );
  const topics = buildTopics(discovered, assignments, messages);
  const actions = parseInsightActions(await ask(buildActionsPrompt({ topics, products, store }), 600), topics);
  return { topics, actions, aiFailed: false };
}

/**
 * The discount suggestion, or null when this shop's numbers don't call for
 * one. Evaluated when the page loads, so it disappears the moment the
 * merchant turns a discount on.
 */
export function discountSuggestion({ discountEnabled, canDiscount, opened, orders }) {
  const o = Number(opened) || 0;
  const n = Number(orders) || 0;
  if (!canDiscount || discountEnabled || o < DISCOUNT_MIN_OPENED || n >= o * DISCOUNT_MAX_CONVERSION) return null;
  return {
    kind: "app",
    title: "Turn on a discount for DM checkout links",
    detail: `${o} people opened a checkout link from your DMs in the last ${INSIGHTS_WINDOW_DAYS} days and ${n === 0 ? "none of them" : `only ${n}`} bought. A small discount on those links applies itself at checkout and gives the ones who were close a reason to finish.`,
    topic: null,
    basis: `Based on: ${o} links opened, ${n} ${n === 1 ? "order" : "orders"}, last ${INSIGHTS_WINDOW_DAYS} days`,
    cta: { label: "Set up a discount", href: "/app#sr-discount" },
  };
}

/** Stored actions minus any app suggestion about discounts, which is decided live instead. */
export function withoutDiscountActions(actions) {
  return (actions || []).filter((a) => !(a?.kind === "app" && /discount/i.test(`${a.title} ${a.detail || ""}`)));
}

/** What the card shows under "What to do next": the live discount suggestion first, then the stored ones. */
export function liveInsightActions(storedActions, discount) {
  const rest = withoutDiscountActions(storedActions);
  return (discount ? [discount, ...rest] : rest).slice(0, MAX_ACTIONS);
}

/** Card payload stored in shop_insights.data. */
export function buildInsightData({ stats, products, topics, actions, sampled, aiFailed = false }) {
  return {
    total: Number(stats?.total) || 0,
    relevant: Number(stats?.relevant) || 0,
    negative: Number(stats?.negative) || 0,
    byChannel: stats?.by_channel || {},
    currency: stats?.currency || "USD",
    sampled,
    aiFailed,
    products: products.map((p) => ({
      productId: p.product_id,
      title: p.title,
      messages: Number(p.messages) || 0,
      clicked: Number(p.clicked) || 0,
      orders: Number(p.orders) || 0,
      revenue: Number(p.revenue) || 0,
      flag: p.flag,
    })),
    topics,
    actions,
  };
}

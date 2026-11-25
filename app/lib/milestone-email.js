/**
 * The one-time email sent when the AI has answered a store's first 10
 * customer messages. Rules and content picking only, so they are testable.
 *
 * Active stores reach 10 answered messages within a few days of connecting
 * (Tabcase the same day, Love by Luna and Shane's in two), well inside the
 * 14-day trial and usually before the first weekly report, which is the
 * point: the merchant sees it working while they are deciding whether to pay.
 */
export const FIRST_ANSWERS = 10;
export const FIRST_ANSWERS_MILESTONE = "first_10_answered";
// Only a store that crossed 10 recently is told so. Without this, every store
// that passed 10 long ago would get "your AI just answered 10" on release day.
export const MILESTONE_WINDOW_HOURS = 72;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUESTION_INTENTS = new Set(["product_question", "price_request", "variant_inquiry", "store_question", "purchase"]);

/**
 * @param {{isReviewShop: boolean, isDevStore: boolean, active: boolean, optedOut: boolean, email: string|null,
 *   alreadySent: boolean, repliesOff: boolean, answered: number, answeredBeforeWindow: number}} facts
 * @returns {{send: true} | {send: false, reason: string}}
 */
export function planMilestoneEmail(facts) {
  if (facts.isReviewShop) return { send: false, reason: "Shopify review store" };
  if (facts.isDevStore) return { send: false, reason: "Development store" };
  if (!facts.active) return { send: false, reason: "Not installed" };
  if (facts.optedOut) return { send: false, reason: "Unsubscribed" };
  if (!facts.email || !EMAIL_RE.test(facts.email)) return { send: false, reason: "No owner email" };
  if (facts.alreadySent) return { send: false, reason: "Already sent" };
  // A store that has switched the AI off chose to; celebrating its answers
  // then reads as not listening.
  if (facts.repliesOff) return { send: false, reason: "Replies switched off" };
  if ((Number(facts.answered) || 0) < FIRST_ANSWERS) {
    return { send: false, reason: `${Number(facts.answered) || 0} answered so far` };
  }
  if ((Number(facts.answeredBeforeWindow) || 0) >= FIRST_ANSWERS) {
    return { send: false, reason: `Passed ${FIRST_ANSWERS} answered more than ${MILESTONE_WINDOW_HOURS} hours ago` };
  }
  return { send: true };
}

const oneLine = (text) => String(text || "").replace(/\s+/g, " ").trim();
const chars = (text) => Array.from(text).length;

// Customers send phone numbers, addresses and emails to order by DM. None of
// that belongs in an email, so a message with any of it is not quoted.
function looksPersonal(text) {
  const digits = text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s().-]/g, "");
  return /\d{7,}/.test(digits) || /[\w.+-]+@[\w-]+\.\w/.test(text) || /https?:\/\/|www\./i.test(text) || /(^|\s)@\w/.test(text);
}

/**
 * A reply cut down for an email: one line, about two sentences. A link reads
 * "(link)": the email is a summary, and a tracked link clicked from it would
 * count as a customer click.
 */
export function replySnippet(text, max = 170) {
  const clean = oneLine(String(text || "").replace(/https?:\/\/\S+/g, "(link)")).replace(/\s+([.,!?;:])/g, "$1");
  if (chars(clean) <= max) return clean;
  const cut = Array.from(clean).slice(0, max).join("");
  return `${cut.replace(/\s+\S*$/, "")}…`;
}

const QUESTION_RE =
  /[?؟]|^(how|what|which|where|when|why|do|does|is|are|can|could|will|would|any|كم|بكم|هل|وين|متى|كيف|ايش|شو|وش|cu[aá]nto|qu[eé]|d[oó]nde|tienen|est[aá])\b/iu;

/**
 * Up to three questions the AI answered, best first: ones whose reply sent a
 * product link, then the rest, newest first within each. Reactions are not
 * questions: on Love by Luna, picking by recency alone quoted "Letsss gooo
 * sags" and "moonchild".
 *
 * @param {Array<{text: string, ai_intent: string, reply_text: string, has_product_link?: boolean}>} rows - newest first
 */
export function pickExamples(rows, max = 3) {
  const seen = new Set();
  const candidates = [];
  (rows || []).forEach((row, index) => {
    const question = oneLine(row?.text);
    if (chars(question) < 8 || chars(question) > 160) return;
    if (!QUESTION_INTENTS.has(row?.ai_intent) || !QUESTION_RE.test(question) || looksPersonal(question)) return;
    const reply = replySnippet(row?.reply_text);
    if (chars(reply) < 8) return;
    const key = question.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ question, reply, linked: row?.has_product_link ? 1 : 0, index });
  });
  return candidates
    .sort((a, b) => b.linked - a.linked || a.index - b.index)
    .slice(0, max)
    .map(({ question, reply }) => ({ question, reply }));
}

/** The one setup step most likely to make the next 10 answers better. */
export function nextStepFor(facts) {
  if (!facts.mappedPosts) {
    return {
      title: "Map your posts to their products",
      body: "On the Home page, link each Instagram post to the product in it. Then questions about that post get a checkout link for the right item.",
      cta: "Map my posts",
    };
  }
  if (facts.canBrandVoice && !facts.brandVoiceSet) {
    return {
      title: "Make the replies sound like you",
      body: "Under Automation on the Home page, pick a tone or describe how you talk to customers, and every reply follows it.",
      cta: "Set my brand voice",
    };
  }
  return null;
}

/**
 * Weekly merchant email: subject, preheader, HTML and plain text.
 * Pure. Table layout and inline styles, which is what mail clients render.
 */
import { PLANS } from "./plans";

const BRAND = {
  pink: "#f07fd2",
  purple: "#6e1a7d",
  purpleLight: "#c25cc4",
  wash: "#fcebf5",
  ink: "#1a1a1a",
  body: "#4a4a4a",
  muted: "#8a8a8a",
  line: "#f0dbe9",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const PLAN_LABEL = { FREE: "Free", GROWTH: "Basic", PRO: "Pro" };
// Links and images in emails use the brand domain, which serves this app.
export const EMAIL_SITE_URL = process.env.EMAIL_SITE_URL || "https://www.socialrepl.ai";
// Founder's 15-minute setup call (Google Calendar appointment schedule).
// EMAIL_BOOKING_URL overrides it; set it to "off" to drop the button.
const DEFAULT_BOOKING_URL = "https://calendar.app.google/7StMWazPBC8jRfJE7";
export function bookingUrl() {
  const v = process.env.EMAIL_BOOKING_URL;
  if (v === "off") return null;
  return v || DEFAULT_BOOKING_URL;
}
export const POSTAL_ADDRESS = "Tennyson Labs, 1312 17th Street Unit #2114, Denver, CO 80202";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const n = (v) => Number(v) || 0;
const fmtInt = (v) => n(v).toLocaleString("en-US");
function fmtMoney(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n(amount));
  } catch {
    return `${Math.round(n(amount))} ${currency}`;
  }
}
const plural = (count, one, many = `${one}s`) => `${fmtInt(count)} ${count === 1 ? one : many}`;

/** Links every email needs. Admin links open the app inside the store's Shopify admin. */
export function buildEmailLinks({ shopDomain, appUrl, unsubscribeUrl }) {
  const store = String(shopDomain || "").replace(/\.myshopify\.com$/, "");
  const admin = `https://admin.shopify.com/store/${store}/apps/socialreplai`;
  return {
    home: admin,
    analytics: `${admin}/app/analytics`,
    billing: `${admin}/app/billing/select`,
    review: "https://apps.shopify.com/socialreplai/reviews",
    booking: bookingUrl(),
    unsubscribe: unsubscribeUrl,
    logo: `${String(appUrl || "").replace(/\/$/, "")}/email/logo.png`,
  };
}

// ---------- content blocks (each returns {html, text}) ----------

const p = (html, style = "") =>
  `<p style="margin:0 0 14px;font:15px/1.55 ${FONT};color:${BRAND.body};${style}">${html}</p>`;

function button(label, href) {
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr><td style="border-radius:8px;background:${BRAND.purple}"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font:600 15px ${FONT};color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(label)}</a></td></tr></table>`,
    text: `${label}: ${href}`,
  };
}

/** "Need a hand?" line with a secondary button to book a setup call, or a reply prompt without one. */
function helpBlock(links) {
  if (!links.booking) return para("Stuck on a step? Reply to this email and I'll help.");
  const text = "Stuck on a step? Book a 15-minute setup call and I'll walk you through it, or just reply to this email.";
  return {
    html: `${p(escapeHtml(text))}<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr><td style="border-radius:8px;border:2px solid ${BRAND.purple}"><a href="${escapeHtml(links.booking)}" style="display:inline-block;padding:10px 20px;font:600 15px ${FONT};color:${BRAND.purple};text-decoration:none;border-radius:8px">Book a setup call</a></td></tr></table>`,
    text: `${text}\nBook a setup call: ${links.booking}`,
  };
}

function heading(text) {
  return {
    html: `<h1 style="margin:0 0 14px;font:800 24px/1.25 ${FONT};color:${BRAND.ink};letter-spacing:-0.3px">${escapeHtml(text)}</h1>`,
    text: text.toUpperCase(),
  };
}

function para(text) {
  return { html: p(escapeHtml(text)), text };
}

function steps(items) {
  const rows = items
    .map(
      (item, i) =>
        `<tr><td valign="top" style="padding:0 10px 10px 0"><span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:${BRAND.pink};color:#fff;font:700 12px/22px ${FONT};text-align:center">${i + 1}</span></td><td style="padding:1px 0 10px;font:15px/1.5 ${FONT};color:${BRAND.body}">${escapeHtml(item)}</td></tr>`
    )
    .join("");
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px">${rows}</table>`,
    text: items.map((item, i) => `${i + 1}. ${item}`).join("\n"),
  };
}

function stats(cells) {
  const width = Math.floor(100 / cells.length);
  const tds = cells
    .map((c, i) => {
      const divider = i < cells.length - 1 ? `border-right:1px solid ${BRAND.line};` : "";
      return `<td width="${width}%" valign="top" style="padding:14px 10px;${divider}"><div style="font:800 26px/1.1 ${FONT};color:${BRAND.ink}">${escapeHtml(c.value)}</div><div style="margin-top:4px;font:13px/1.3 ${FONT};color:${BRAND.muted}">${escapeHtml(c.label)}</div></td>`;
    })
    .join("");
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:${BRAND.wash};border-radius:10px"><tr>${tds}</tr></table>`,
    text: cells.map((c) => `${c.label}: ${c.value}`).join("\n"),
  };
}

function topics(list) {
  const rows = list
    .map(
      (t) =>
        `<tr><td style="padding:9px 0;border-top:1px solid ${BRAND.line};font:15px/1.4 ${FONT};color:${BRAND.ink}">${escapeHtml(t.label)}</td><td align="right" style="padding:9px 0;border-top:1px solid ${BRAND.line};font:700 15px ${FONT};color:${BRAND.ink}">${fmtInt(t.count)}</td></tr>`
    )
    .join("");
  return {
    html: `<div style="margin:0 0 6px;font:700 13px ${FONT};color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.6px">Top questions, last 30 days</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${rows}</table>`,
    text: `Top questions, last 30 days:\n${list.map((t) => `- ${t.label} (${t.count})`).join("\n")}`,
  };
}

function callout(title, body, cta) {
  const btn = cta ? button(cta.label, cta.href) : null;
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;border:1px solid ${BRAND.line};border-left:4px solid ${BRAND.pink};border-radius:8px"><tr><td style="padding:16px 18px 4px"><div style="margin:0 0 6px;font:700 15px ${FONT};color:${BRAND.ink}">${escapeHtml(title)}</div>${p(escapeHtml(body))}${btn ? btn.html : ""}</td></tr></table>`,
    text: `${title}\n${body}${btn ? `\n${btn.text}` : ""}`,
  };
}

/** Real customer questions with a snippet of what the AI replied. */
function exchanges(list) {
  const rows = list
    .map(
      (e) =>
        `<tr><td style="padding:12px 0;border-top:1px solid ${BRAND.line}"><div style="font:600 15px/1.45 ${FONT};color:${BRAND.ink}">&ldquo;${escapeHtml(e.question)}&rdquo;</div><div style="margin-top:4px;font:14px/1.5 ${FONT};color:${BRAND.body}"><span style="color:${BRAND.purple};font-weight:600">AI:</span> ${escapeHtml(e.reply)}</div></td></tr>`
    )
    .join("");
  return {
    html: `<div style="margin:0 0 6px;font:700 13px ${FONT};color:${BRAND.muted};text-transform:uppercase;letter-spacing:0.6px">A few questions it answered</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${rows}</table>`,
    text: `A few questions it answered:\n${list.map((e) => `- "${e.question}"\n  AI: ${e.reply}`).join("\n")}`,
  };
}

// ---------- per-kind content ----------

// Last step of every setup list. Worded as a check the merchant can run, so it
// doesn't read as one more thing they must do before the app works.
const TEST_STEP =
  "Test it out (optional): from your personal Instagram, DM your connected business account a question about one of your products and watch the AI reply.";

function connectContent({ facts, links }) {
  if (facts.needsPlan) {
    return {
      subject: "Start your free trial and connect Instagram",
      preheader: "Pick a plan (the first 14 days are free), connect Instagram, and the AI starts answering DMs.",
      blocks: [
        heading("Start your free trial and connect Instagram"),
        para(
          `SocialRepl.ai is installed on ${facts.storeName}, but it isn't switched on yet. It takes a couple of minutes, then the AI starts answering customer DMs and comments with checkout links.`
        ),
        steps([
          "Open SocialRepl.ai and choose a plan. Your first 14 days are free.",
          "Click Connect Instagram and log in with your business account.",
          TEST_STEP,
        ]),
        button("Start my free trial", links.home),
        helpBlock(links),
      ],
    };
  }
  return {
    subject: "Your Instagram isn't connected to SocialRepl.ai yet",
    preheader: "Connect once and the AI starts answering DMs with checkout links.",
    blocks: [
      heading("Finish setup in about two minutes"),
      para(
        `SocialRepl.ai is installed on ${facts.storeName}, but Instagram isn't connected, so customer DMs and comments aren't being answered yet.`
      ),
      steps([
        "Open SocialRepl.ai in your Shopify admin.",
        "Click Connect Instagram and log in with your business account.",
        TEST_STEP,
      ]),
      button("Connect Instagram", links.home),
      helpBlock(links),
    ],
  };
}

function setupContent({ facts, links }) {
  const checks = [
    'In the Instagram app, go to Settings, Messages and story replies, Message requests, and turn on "Allow access to messages" under Connected tools.',
    "On the SocialRepl.ai Home page, check that DM automation is switched on.",
  ];
  if (facts.replyHoursOn) checks.push("Check your reply hours. The AI only answers inside the schedule you set.");
  return {
    subject: "No customer messages reached SocialRepl.ai in 2 weeks",
    preheader: "Usually it's one Instagram setting. Here's what to check.",
    blocks: [
      heading("We haven't seen a customer message in 14 days"),
      para(`Instagram is connected for ${facts.storeName}, but nothing has come through. Usually it's one of these:`),
      steps(checks),
      button("Check my setup", links.home),
      para("If everything looks right and it's just a quiet stretch, ignore this."),
      helpBlock(links),
    ],
  };
}

function upsellBlock(upsell, facts, links) {
  const to = PLAN_LABEL[upsell.to];
  const cta = { label: `See ${to}`, href: links.billing };
  if (upsell.reason === "stories") {
    return callout(
      `${plural(upsell.count, "story reply", "story replies")} went unanswered this month`,
      `Your plan doesn't answer story replies or mentions. ${to} replies to them automatically, with a link to the right product.`,
      cta
    );
  }
  if (upsell.reason === "cap") {
    return callout(
      `You've used ${fmtInt(facts.usage)} of ${fmtInt(facts.cap)} messages this month`,
      `When you reach the limit, replies stop until next month. ${to} covers ${fmtInt(PLANS[upsell.to].cap)} messages a month.`,
      cta
    );
  }
  return callout(
    `${plural(upsell.count, "comment")} asked about products this month`,
    `Your plan doesn't answer comments. ${to} replies to them with a private DM and a checkout link.`,
    cta
  );
}

function reportContent({ facts, decision, links }) {
  const w = facts.week || {};
  const orders = n(w.orders);
  const subject =
    orders > 0
      ? `${plural(orders, "order")} from Instagram this week`
      : n(w.responded) > 0
        ? `Your week on Instagram: ${plural(n(w.responded), "question")} answered`
        : `Your week on Instagram: ${plural(n(w.received), "message")} received`;
  const cells = [
    { label: "Messages received", value: fmtInt(w.received) },
    { label: "Answered by AI", value: fmtInt(w.responded) },
    { label: "Link clicks", value: fmtInt(w.clicks) },
    { label: orders > 0 ? `Orders, ${fmtMoney(w.revenue, w.currency)}` : "Orders", value: fmtInt(orders) },
  ];
  // Most messages that go unanswered are chat that isn't about the store, which
  // the AI skips on purpose, so "answered X of Y" would read as a failure rate.
  const blocks = [
    heading(`Here's your week, ${facts.storeName}`),
    para(
      `The AI answered ${plural(n(w.responded), "question")} about your products and store and sent ${plural(n(w.linksSent), "checkout link")}.`
    ),
    stats(cells),
  ];
  const insight = facts.insight;
  if (insight?.topics?.length) {
    blocks.push(topics(insight.topics.slice(0, 3)));
    if (insight.action) blocks.push(callout("Try this", `${insight.action.title}. ${insight.action.detail || ""}`.trim(), null));
  }
  blocks.push(button("Open analytics", links.analytics));
  if (decision.extras.includes("review")) {
    blocks.push(
      callout(
        "Is SocialRepl.ai helping your store?",
        "A short review on the Shopify App Store helps other store owners find us. It takes a minute, and honest feedback of any kind is welcome.",
        { label: "Write a review", href: links.review }
      )
    );
  }
  if (decision.upsell) blocks.push(upsellBlock(decision.upsell, facts, links));
  return {
    subject,
    preheader: `${plural(n(w.responded), "question")} answered, ${plural(n(w.clicks), "link click")}${orders ? `, ${plural(orders, "order")}` : ""}.`,
    blocks,
  };
}

const BUILDERS = { connect: connectContent, setup: setupContent, report: reportContent };

/** Replace a rendered email's unsubscribe link, in both its raw and HTML-escaped forms. */
export function replaceUnsubscribeLink(email, realUrl, newUrl) {
  const swap = (body) =>
    String(body).split(escapeHtml(realUrl)).join(escapeHtml(newUrl)).split(realUrl).join(newUrl);
  return { ...email, html: swap(email.html), text: swap(email.text) };
}

/** Shared layout: logo, white card with the blocks and signature, then the footer. */
function renderShell({ subject, preheader, blocks, logo, footer }) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.wash}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.wash}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
<tr><td style="padding:0 4px 18px"><img src="${escapeHtml(logo)}" width="170" height="38" alt="SocialRepl.ai" style="display:block;border:0"></td></tr>
<tr><td style="background:#ffffff;border-radius:14px;padding:30px 28px 14px">
${blocks.map((b) => b.html).join("\n")}
<p style="margin:4px 0 16px;font:15px/1.55 ${FONT};color:${BRAND.body}">Stephan<br><span style="color:${BRAND.muted}">Founder, SocialRepl.ai</span></p>
</td></tr>
<tr><td style="padding:18px 8px 0;font:12px/1.6 ${FONT};color:${BRAND.muted};text-align:center">
${footer.html}<br>${escapeHtml(POSTAL_ADDRESS)}
</td></tr>
</table></td></tr></table>
</body></html>`;
  const text = [...blocks.map((b) => b.text), "Stephan\nFounder, SocialRepl.ai", "--", `${footer.text}\n${POSTAL_ADDRESS}`].join("\n\n");
  return { subject, preheader, html, text };
}

/**
 * @param {{decision: object, facts: object, links: object}} input
 * @returns {{subject: string, preheader: string, html: string, text: string}}
 */
export function renderWeeklyEmail({ decision, facts, links }) {
  const { subject, preheader, blocks } = BUILDERS[decision.kind]({ decision, facts, links });
  return renderShell({
    subject,
    preheader,
    blocks,
    logo: links.logo,
    footer: {
      html: `You're receiving this because SocialRepl.ai is installed on ${escapeHtml(facts.shopDomain)}.<br><a href="${escapeHtml(links.unsubscribe)}" style="color:${BRAND.purpleLight}">Unsubscribe</a>`,
      text: `You're receiving this because SocialRepl.ai is installed on ${facts.shopDomain}. Unsubscribe: ${links.unsubscribe}`,
    },
  });
}

/**
 * One-time email once the AI has answered a store's first 10 customer
 * messages. Every figure and quote is the store's own. Counts say "messages"
 * because many answered ones are comments like "need this", not questions.
 *
 * @param {{facts: {storeName: string, shopDomain: string, answered: number, linksSent: number, opened: number,
 *   orders: number, revenue: number, currency: string, daysConnected: number,
 *   examples: Array<{question: string, reply: string}>, nextStep: object|null}, links: object}} input
 */
export function renderMilestoneEmail({ facts, links }) {
  const answered = n(facts.answered);
  const orders = n(facts.orders);
  const days = n(facts.daysConnected);
  const subject =
    orders > 0
      ? `${plural(answered, "message")} answered and ${plural(orders, "order")} from Instagram`
      : `Your AI has answered ${plural(answered, "customer message")}`;
  const since = days < 1 ? "In your first day on SocialRepl.ai" : `In the ${plural(days, "day")} since you connected Instagram`;
  const blocks = [
    heading(`${plural(answered, "customer message")} answered`),
    para(
      `${since}, the AI answered ${plural(answered, "message")} from ${facts.storeName}'s customers and sent ${plural(n(facts.linksSent), "checkout link")}.` +
        (orders > 0 ? ` ${plural(orders, "order")} worth ${fmtMoney(facts.revenue, facts.currency)} came from those links.` : "")
    ),
    stats([
      { label: "Answered by AI", value: fmtInt(answered) },
      { label: "Checkout links", value: fmtInt(facts.linksSent) },
      { label: "Links opened", value: fmtInt(facts.opened) },
      { label: orders > 0 ? `Orders, ${fmtMoney(facts.revenue, facts.currency)}` : "Orders", value: fmtInt(orders) },
    ]),
  ];
  if (facts.examples?.length) blocks.push(exchanges(facts.examples));
  if (facts.nextStep) {
    blocks.push(callout(facts.nextStep.title, facts.nextStep.body, { label: facts.nextStep.cta, href: links.home }));
  }
  blocks.push(button("See every conversation", links.analytics), helpBlock(links));
  return renderShell({
    subject,
    preheader: `${plural(answered, "message")} answered, ${plural(n(facts.linksSent), "checkout link")} sent${orders ? `, ${plural(orders, "order")}` : ""}.`,
    blocks,
    logo: links.logo,
    footer: {
      html: `You're receiving this because SocialRepl.ai is installed on ${escapeHtml(facts.shopDomain)}.<br><a href="${escapeHtml(links.unsubscribe)}" style="color:${BRAND.purpleLight}">Unsubscribe</a>`,
      text: `You're receiving this because SocialRepl.ai is installed on ${facts.shopDomain}. Unsubscribe: ${links.unsubscribe}`,
    },
  });
}

/**
 * One-time email when a store installs (or reinstalls) the app. Onboarding
 * only, no plan or upgrade talk, since it goes out on the transactional stream.
 * @param {{facts: {storeName: string, shopDomain: string}, links: object, reinstall?: boolean}} input
 */
export function renderWelcomeEmail({ facts, links, reinstall = false }) {
  const blocks = [
    heading(reinstall ? `Welcome back, ${facts.storeName}` : `Welcome to SocialRepl.ai, ${facts.storeName}`),
    para(
      "Thanks for installing. Once Instagram is connected, the AI answers DMs and comments about your products, using your live catalog and store policies, with a checkout link for the right item."
    ),
    // Every install and reinstall starts without a plan (Free is retired), so
    // choosing one, with its 14-day trial, is always the first step.
    steps([
      "Open SocialRepl.ai and choose a plan. Your first 14 days are free.",
      "Connect your Instagram business account from the Home page, then map your products to your posts so every reply links the right item.",
      TEST_STEP,
    ]),
    button("Start my free trial", links.home),
    para(
      "You stay in control. Reply to a customer yourself and the AI steps aside in that chat, and Reply hours lets you choose when it answers."
    ),
    helpBlock(links),
  ];
  return renderShell({
    subject: reinstall ? "Welcome back to SocialRepl.ai" : "Welcome to SocialRepl.ai: your first reply in 3 steps",
    preheader: "Connect Instagram and the AI starts answering DMs with checkout links.",
    blocks,
    logo: links.logo,
    footer: {
      html: `You're receiving this because SocialRepl.ai was installed on ${escapeHtml(facts.shopDomain)}.<br>We also send a short weekly summary, and each one has an unsubscribe link.`,
      text: `You're receiving this because SocialRepl.ai was installed on ${facts.shopDomain}. We also send a short weekly summary, and each one has an unsubscribe link.`,
    },
  });
}

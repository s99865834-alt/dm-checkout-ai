/**
 * Classify a fixed battery of real messages so a classifier prompt change can
 * be measured instead of guessed at. Run it before and after the edit and diff
 * the two JSON files.
 *
 * Half the battery is held out: the HELD_* messages must never be quoted in the
 * prompt, because they are the only evidence a change generalises rather than
 * memorising the examples it was given. gpt-4o-mini runs at temperature 0.3, so
 * a single run is not a result — run 3 and only believe what repeats.
 *
 * Costs real OpenAI calls (one per message) and sends nothing to any merchant.
 *
 * Usage: npx vite-node --config scripts/vite-node.config.mjs scripts/classify-probe.mjs [out.json]
 */
import fs from "fs";

// Load .env into process.env BEFORE importing app modules (they read env at import time).
for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { classifyMessage } = await import("../app/lib/ai.server.js");

// [label, text, channel] — channel matters: the comment path gets an extra
// "enthusiastic comments usually mean purchase interest" hint, so a lead has
// to be judged on the channel it really arrived on.
const SPAM = [
  ["spam-wholesale", "Hey Gorgeous!\n\nI'm Alison, the Wholesale Partnership Manager at C&D Beauty. I came across your boutique page and had to stop and connect - I LOVE your aesthetic! I'd love to explore stocking our line with you.", "dm"],
  ["spam-growth", "I'm still not ready to give up, haha. The information in the loom could be the missing piece to your revenue puzzle. Take a quick look and let me know what you think!", "dm"],
  ["spam-income", "Just curious though, do you ever see yourself building an online source of income on the side?", "dm"],
  ["spam-followup", "Heyy I'm starting to think you're ghosting me, but I'll give you the benefit of the doubt! Get back to me when you get this 😁", "dm"],
  ["spam-agency", "Hi! We help boutiques like yours scale to 6 figures with paid ads. Would you be open to a quick 15 min call this week?", "dm"],
  ["spam-collab-comment", "Love your page! DM me, I help boutiques like yours grow to 10k followers 🚀", "comment"],
];

// Real traffic that must keep getting a reply. The Love By Luna ones are
// comments on product posts; the Shabby 2 Chic ones are DMs.
const LEADS = [
  ["lead-soft", "oh i love this", "comment"],
  ["lead-named", "Libra polish", "comment"],
  ["lead-emoji", "Libra + libra ❤️", "comment"],
  ["lead-pair", "Libra & Taurus ❤️❤️", "comment"],
  ["lead-request", "Can we have the same for Cancer?? Pretty please 🙏🏻🙏🏻🙏🏻", "comment"],
  ["lead-rambling", "Libra moon with my sun (Aries) is a lighting storm\nLibra moon with my rising (Scorpio) is a whirlpool / typhoon 😍 so intense", "comment"],
  ["lead-compliment", "Damn. Jelly of the aurora one 😂! That's a good one!", "comment"],
  ["lead-personal", "My boyfriend is a libra, I'm a cancer but with libra mars, this is so accurate 🥹", "comment"],
  ["lead-greeting", "Hi man my name is Nelson and I like the artwork of transformers", "dm"],
  ["lead-melanie", "Hey Kim, I used to shop your store when I lived in Lincoln. I still follow you on IG, Melanie Haynes(teacher). Anyway, I love this brown polka dot dress, is it still available?", "dm"],
  ["lead-price", "How much is the rust dress?", "dm"],
  ["lead-store", "Do you ship internationally?", "dm"],
  ["lead-explicit", "I want to buy this!", "dm"],
  ["lead-compliment-only", "I LOVE your boutique, everything is so cute", "dm"],
  ["lead-compliment-comment", "I LOVE your boutique, everything is so cute", "comment"],
];

// Held out on purpose: none of these appear in the prompt, so they are the
// only evidence that a prompt change generalises rather than memorises.
const HELD_SPAM = [
  ["hspam-ambassador", "Hi! I'm a brand ambassador with 50k followers looking to promote products, interested in a collab?", "dm"],
  ["hspam-seo", "We can get your store ranking #1 on Google in 30 days, guaranteed. Interested?", "dm"],
  ["hspam-photog", "Hey! Do you need help with your product photos? I'm a photographer 📸", "dm"],
  ["hspam-audit", "I noticed your site isn't converting as well as it could. Can I send over a free audit?", "dm"],
  ["hspam-recruit", "Are you hiring? I'd love to join your team, here's my resume", "dm"],
  ["hspam-feature", "Hey beautiful, wanna get featured on our page? Just follow us and DM 💕", "comment"],
  ["hspam-dropship", "I run a print on demand supplier and can fulfil your orders at 40% margin, let's chat", "dm"],
];

const HELD_LEADS = [
  ["hlead-stock", "is the green one still in stock?", "dm"],
  ["hlead-need", "omg need this in my life 😍", "comment"],
  ["hlead-sign", "Scorpio season 🦂", "comment"],
  ["hlead-virgo", "do you have anything for a Virgo?", "comment"],
  ["hlead-size", "what size is the model wearing", "dm"],
  ["hlead-taurus", "Taurus 🐂💚", "comment"],
  ["hlead-chatter", "my Pisces moon has me crying at everything lately 😭 so true", "comment"],
  ["hlead-nice", "your stuff is honestly the cutest, obsessed", "dm"],
];

const out = process.argv[2] || "/tmp/classify-out.json";
const rows = [];
for (const [label, text, channel] of [...SPAM, ...LEADS, ...HELD_SPAM, ...HELD_LEADS]) {
  const r = await classifyMessage(text, { channel });
  rows.push({ label, channel, intent: r?.intent ?? "ERROR", confidence: r?.confidence ?? null });
  process.stderr.write(".");
}
process.stderr.write("\n");
fs.writeFileSync(out, JSON.stringify(rows));

// Score on the only thing that matters: whether the message gets a reply. An
// intent is scored against automation's eligible list, not against a guess at
// the "right" label, because not_relevant and clarification_needed both end in
// silence on a cold thread (see eligibleIntents in automation.server.js).
const ELIGIBLE = ["purchase", "product_question", "variant_inquiry", "price_request", "store_question"];
const groups = [
  ["in-prompt spam", SPAM, false],
  ["in-prompt leads", LEADS, true],
  ["HELD-OUT spam", HELD_SPAM, false],
  ["HELD-OUT leads", HELD_LEADS, true],
];

for (const [name, battery, shouldReply] of groups) {
  const labels = new Set(battery.map(([l]) => l));
  const mine = rows.filter((r) => labels.has(r.label));
  const wrong = mine.filter((r) => ELIGIBLE.includes(r.intent) !== shouldReply);
  const detail = wrong.map((r) => `${r.label}=${r.intent}`).join(", ");
  console.log(
    `${name.padEnd(17)} ${mine.length - wrong.length}/${mine.length} correct` +
      (detail ? `   WRONG: ${detail}` : "")
  );
}
console.log(`\nwrote ${rows.length} rows to ${out}`);

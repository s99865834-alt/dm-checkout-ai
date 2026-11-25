/**
 * The one-time "first 10 answered" email: who gets it, what it quotes, and
 * what it says. Every figure and quote in it is the store's own.
 */
import { describe, it, expect } from "vitest";
import {
  FIRST_ANSWERS,
  MILESTONE_WINDOW_HOURS,
  nextStepFor,
  pickExamples,
  planMilestoneEmail,
  replySnippet,
} from "../app/lib/milestone-email";
import { buildEmailLinks, renderMilestoneEmail } from "../app/lib/weekly-email-template";

const eligible = {
  isReviewShop: false,
  isDevStore: false,
  active: true,
  optedOut: false,
  email: "owner@store.test",
  alreadySent: false,
  answered: 12,
  answeredBeforeWindow: 4,
};

describe("planMilestoneEmail", () => {
  it("sends once a store has just crossed 10 answered", () => {
    expect(planMilestoneEmail(eligible)).toEqual({ send: true });
  });

  it.each([
    ["the Shopify review store", { isReviewShop: true }, "Shopify review store"],
    ["a development store", { isDevStore: true }, "Development store"],
    ["an uninstalled store", { active: false }, "Not installed"],
    ["an unsubscribed owner", { optedOut: true }, "Unsubscribed"],
    ["a store with no owner email", { email: null }, "No owner email"],
    ["a store that already had it", { alreadySent: true }, "Already sent"],
    ["a store that switched its replies off", { repliesOff: true }, "Replies switched off"],
    ["a store short of 10", { answered: 9 }, "9 answered so far"],
  ])("skips %s", (_label, change, reason) => {
    expect(planMilestoneEmail({ ...eligible, ...change })).toEqual({ send: false, reason });
  });

  it("does not tell a store that passed 10 long ago that it just did", () => {
    const old = planMilestoneEmail({ ...eligible, answered: 515, answeredBeforeWindow: 500 });
    expect(old.send).toBe(false);
    expect(old.reason).toBe(`Passed ${FIRST_ANSWERS} answered more than ${MILESTONE_WINDOW_HOURS} hours ago`);
  });
});

describe("pickExamples", () => {
  const row = (text, reply, ai_intent = "product_question", has_product_link = false) => ({ text, reply_text: reply, ai_intent, has_product_link });

  it("quotes real questions, three at most, ones that got a product link first", () => {
    const rows = [
      row("Do you ship to the UAE?", "Yes, delivery to the UAE is 4 OMR.", "store_question"),
      row("How much is the Arabian Horses case?", "It's 8.500 OMR. Here's the link: https://tabcase.co/a/go/abc", "price_request", true),
      row("Does it fit the iPad Pro 11 M1?", "Yes, it fits the 2018 to 2023 Pro 11."),
      row("Is the black one back in stock?", "Not yet, we expect it next week."),
    ];
    expect(pickExamples(rows)).toEqual([
      { question: "How much is the Arabian Horses case?", reply: "It's 8.500 OMR. Here's the link: (link)" },
      { question: "Do you ship to the UAE?", reply: "Yes, delivery to the UAE is 4 OMR." },
      { question: "Does it fit the iPad Pro 11 M1?", reply: "Yes, it fits the 2018 to 2023 Pro 11." },
    ]);
  });

  it("reads questions in Arabic and Spanish too", () => {
    const rows = [row("بكم كفر التصميم 24؟", "سعره 7.500 ر.ع."), row("¿Cuánto cuesta el envío a Madrid?", "El envío es gratis.", "store_question")];
    expect(pickExamples(rows)).toHaveLength(2);
  });

  it("never quotes a phone number, an email address, a link or a handle", () => {
    const rows = [
      row("العنود / ٩٢٥٨٠٠٤٠ / مكتب حفيت / آيباد ١١برو؟", "تم، فريقنا بيتواصل معك."),
      row("Can you call me on 9123 4567 about the case?", "Sure, the team will call you."),
      row("my email is sara@mail.com can you send it?", "Sent!"),
      row("is this the one from https://instagram.com/p/x ?", "Yes, that's Design 24."),
      row("@sara_k wants one too, price?", "It's 7.500 OMR."),
    ];
    expect(pickExamples(rows)).toEqual([]);
  });

  it("skips reactions, chat and repeats", () => {
    const rows = [
      row("Letsss gooo sags", "Love your Sag energy! Check it out here: https://x.co/a/go/1", "purchase", true),
      row("hi", "Hi! How can I help?"),
      row("Amen 🙏🏾 thank you so much", "Thanks!", "not_relevant"),
      row("How much is shipping?", "Shipping is free over $50.", "store_question"),
      row("how much is shipping?", "Shipping is free over $50.", "store_question"),
    ];
    expect(pickExamples(rows).map((e) => e.question)).toEqual(["How much is shipping?"]);
  });
});

describe("replySnippet", () => {
  it("marks links instead of printing them, and cuts long replies at a word", () => {
    expect(replySnippet("Order here: https://store.co/a/go/abc. Thanks!")).toBe("Order here: (link) Thanks!");
    const long = replySnippet(`${"word ".repeat(60)}end`, 40);
    expect(long.endsWith("…")).toBe(true);
    expect(Array.from(long).length).toBeLessThanOrEqual(41);
  });
});

describe("nextStepFor", () => {
  it("asks for post mappings first, then a brand voice, then nothing", () => {
    expect(nextStepFor({ mappedPosts: 0 }).title).toBe("Map your posts to their products");
    expect(nextStepFor({ mappedPosts: 3, canBrandVoice: true, brandVoiceSet: false }).title).toBe(
      "Make the replies sound like you"
    );
    expect(nextStepFor({ mappedPosts: 3, canBrandVoice: false, brandVoiceSet: false })).toBeNull();
    expect(nextStepFor({ mappedPosts: 3, canBrandVoice: true, brandVoiceSet: true })).toBeNull();
  });

  it("never pushes a discount", () => {
    for (const facts of [{ mappedPosts: 0 }, { mappedPosts: 2, canBrandVoice: true }]) {
      expect(JSON.stringify(nextStepFor(facts))).not.toMatch(/discount/i);
    }
  });
});

describe("renderMilestoneEmail", () => {
  const links = buildEmailLinks({
    shopDomain: "tabcase.myshopify.com",
    appUrl: "https://www.socialrepl.ai",
    unsubscribeUrl: "{{{ pm:unsubscribe }}}",
  });
  const facts = {
    storeName: "Tabcase",
    shopDomain: "tabcase.myshopify.com",
    answered: 12,
    linksSent: 7,
    opened: 3,
    orders: 0,
    revenue: 0,
    currency: "OMR",
    daysConnected: 2,
    examples: [{ question: "How much is the Arabian Horses case?", reply: "It's 8.500 OMR." }],
    nextStep: nextStepFor({ mappedPosts: 0 }),
  };

  it("leads with the store's own count", () => {
    const email = renderMilestoneEmail({ facts, links });
    expect(email.subject).toBe("Your AI has answered 12 customer messages");
    expect(email.html).toContain("12 customer messages answered");
    expect(email.text).toContain("In the 2 days since you connected Instagram, the AI answered 12 messages from Tabcase's customers and sent 7 checkout links.");
    expect(email.text).toContain('"How much is the Arabian Horses case?"');
    expect(email.text).toContain("Map your posts to their products");
    expect(email.html).toContain("{{{ pm:unsubscribe }}}");
  });

  it("leads with orders when there are some", () => {
    const email = renderMilestoneEmail({ facts: { ...facts, orders: 1, revenue: 8.5 }, links });
    expect(email.subject).toBe("12 messages answered and 1 order from Instagram");
    expect(email.text).toContain("1 order worth");
  });

  it("says first day when the store connected today", () => {
    expect(renderMilestoneEmail({ facts: { ...facts, daysConnected: 0 }, links }).text).toContain(
      "In your first day on SocialRepl.ai"
    );
  });

  it("works without examples or a next step, and never uses an em dash", () => {
    const email = renderMilestoneEmail({ facts: { ...facts, examples: [], nextStep: null }, links });
    expect(email.text).not.toContain("A few questions it answered");
    expect(email.html + email.text + email.subject).not.toContain("\u2014");
  });
});

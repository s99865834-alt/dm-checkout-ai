import { describe, it, expect } from "vitest";
// Imported from reply-rules, not automation.server: that module builds the
// Supabase and Shopify clients at import time and needs credentials CI lacks.
import { asksForProductPage, admitsNoAnswer } from "../app/lib/reply-rules";

describe("asksForProductPage", () => {
  it.each([
    "can you send me the product page?",
    "what's the link to the page",
    "do you have a website?",
    "where can I read the full description",
    "can I see more info",
    "I want to read the reviews first",
    "send me the page for the blue one",
  ])("fires on %s", (text) => {
    expect(asksForProductPage(text)).toBe(true);
  });

  it.each([
    // These are product questions. They get answered, then a checkout link.
    "is this jacket waterproof?",
    "does it come in black?",
    "how long does the polish last",
    "is this treatment painful ?",
    "what size should I get",
    // A bare link request means "let me buy", which is a checkout link.
    "send me a link",
    "link please",
    "how much is it",
  ])("does not fire on %s", (text) => {
    expect(asksForProductPage(text)).toBe(false);
  });

  it.each([null, undefined, "", "   "])("returns false for %s", (text) => {
    expect(asksForProductPage(text)).toBe(false);
  });

  it("is case insensitive", () => {
    expect(asksForProductPage("PRODUCT PAGE please")).toBe(true);
  });
});

describe("admitsNoAnswer", () => {
  it("recognises the reply that went out to a real customer", () => {
    // Sent by Shanesecares' automation on 2 Sep. The customer asked a yes/no
    // question and got told to go and read the website.
    expect(
      admitsNoAnswer(
        "Thanks for your question! I don't have information about whether the Soursop Seamoss treatment is painful."
      )
    ).toBe(true);
  });

  it.each([
    "I don't have that detail confirmed, but the owner can confirm here.",
    "I don't have details about the ingredients.",
    "There's no information about shipping times on this one.",
    "I can't confirm whether it's waterproof.",
    "Sorry, I couldn't find any information on that.",
  ])("fires on %s", (text) => {
    expect(admitsNoAnswer(text)).toBe(true);
  });

  it.each([
    // A real answer. Must keep its link.
    "Yes, it's fully waterproof! Here's the link when you're ready.",
    "It comes in Ice, Dawn and Sunset.",
    "No, it only comes in one size.",
    // Hedging about the customer's choice, not about our data. Keeps its link.
    "I'm not sure which size you need, but here's the link.",
    "Not sure if you saw, but it's back in stock!",
  ])("does not fire on %s", (text) => {
    expect(admitsNoAnswer(text)).toBe(false);
  });

  it.each([null, undefined, "", "   "])("returns false for %s", (text) => {
    expect(admitsNoAnswer(text)).toBe(false);
  });
});

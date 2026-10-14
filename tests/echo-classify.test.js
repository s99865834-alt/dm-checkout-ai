import { describe, it, expect } from "vitest";
import {
  echoWords,
  echoSimilarity,
  isAutomatedTemplate,
  FAST_TEMPLATE_DELAY_SEC,
  MAX_TEMPLATE_DELAY_SEC,
} from "../app/lib/echo-classify";

// socialrepl.ai, 14 Oct 2026. Fired 1.8 seconds after "Howdy", the first time
// that text had ever been seen on the account. Requiring a matching echo from
// another conversation meant it was read as the owner replying, which paused
// automation for six hours and swallowed the next message.
const FIRST_EVER_AUTOREPLY =
  "Hi, thanks for contacting us at socialrepl.ai! We've received your message and appreciate you reaching out.";

// Verbatim from Shabby 2 Chic's real Instagram threads, read back from Meta.
// Only the handle changes between firings, which is the whole signal.
const INSTANT_REPLY_A =
  "Thank you for contacting us. mallorynorfleet , we normally respond with 2-4 hours. Our new location is 3200 W 16th Street, Sedalia. The hours are Tuesday - Friday 10-6:00 and Saturday 10-4.";
const INSTANT_REPLY_B =
  "Thank you for contacting us. fbajayden , we normally respond with 2-4 hours. Our new location is 3200 W 16th Street, Sedalia. The hours are Tuesday - Friday 10-6:00 and Saturday 10-4.";
const AWAY_MESSAGE_A =
  "Hi aimasterjoshads, thanks for your message. We are not here right now, but we'll get back to you soon!";
const AWAY_MESSAGE_B =
  "Hi laurahaleydt, thanks for your message. We are not here right now, but we'll get back to you soon!";

// Also real: Kim answering people by hand.
const HUMAN_SHORT = "✅ send it to me";
const HUMAN_CHATTY = "Think it’s odd that mom isn’t in any pics";

describe("echoWords", () => {
  it("lowercases and drops punctuation but keeps digits", () => {
    expect(echoWords("Hours are 10-6:00, Tuesday!")).toEqual([
      "hours",
      "are",
      "10",
      "6",
      "00",
      "tuesday",
    ]);
  });

  it("returns an empty list for media-only echoes", () => {
    expect(echoWords(null)).toEqual([]);
    expect(echoWords("")).toEqual([]);
  });
});

describe("echoSimilarity", () => {
  it("scores two firings of the same template as near-identical", () => {
    expect(echoSimilarity(INSTANT_REPLY_A, INSTANT_REPLY_B)).toBeGreaterThan(0.85);
    expect(echoSimilarity(AWAY_MESSAGE_A, AWAY_MESSAGE_B)).toBeGreaterThan(0.85);
  });

  it("scores the two different templates as different", () => {
    expect(echoSimilarity(INSTANT_REPLY_A, AWAY_MESSAGE_A)).toBeLessThan(0.5);
  });

  it("scores unrelated human replies as different", () => {
    expect(echoSimilarity(HUMAN_SHORT, HUMAN_CHATTY)).toBeLessThan(0.5);
  });

  it("is zero when either side has no words", () => {
    expect(echoSimilarity(null, INSTANT_REPLY_A)).toBe(0);
    expect(echoSimilarity(INSTANT_REPLY_A, "")).toBe(0);
  });
});

describe("isAutomatedTemplate", () => {
  it("catches the instant reply seen in another customer's thread", () => {
    expect(
      isAutomatedTemplate({
        text: INSTANT_REPLY_A,
        secondsSinceInbound: 3,
        otherConversationEchoes: [INSTANT_REPLY_B],
      })
    ).toBe(true);
  });

  it("catches the away message too", () => {
    expect(
      isAutomatedTemplate({
        text: AWAY_MESSAGE_A,
        secondsSinceInbound: 3,
        otherConversationEchoes: ["unrelated chatter here", AWAY_MESSAGE_B],
      })
    ).toBe(true);
  });

  it("catches the very first autoreply on an account, with nothing to compare against", () => {
    expect(
      isAutomatedTemplate({
        text: FIRST_EVER_AUTOREPLY,
        secondsSinceInbound: 1.8,
        otherConversationEchoes: [],
      })
    ).toBe(true);
  });

  it("catches a fast template in a brand new conversation", () => {
    expect(
      isAutomatedTemplate({
        text: INSTANT_REPLY_A,
        secondsSinceInbound: 3,
        otherConversationEchoes: [],
      })
    ).toBe(true);
  });

  // The expensive mistake would be talking over a real merchant, so each
  // condition is still checked on its own.
  it("needs a matching echo once the reply is slower than the fast window", () => {
    const justSlow = FAST_TEMPLATE_DELAY_SEC + 2;
    expect(
      isAutomatedTemplate({
        text: INSTANT_REPLY_A,
        secondsSinceInbound: justSlow,
        otherConversationEchoes: [],
      })
    ).toBe(false);
    expect(
      isAutomatedTemplate({
        text: INSTANT_REPLY_A,
        secondsSinceInbound: justSlow,
        otherConversationEchoes: [INSTANT_REPLY_B],
      })
    ).toBe(true);
  });

  it("does not fire past the outer window, however repetitive", () => {
    expect(
      isAutomatedTemplate({
        text: INSTANT_REPLY_A,
        secondsSinceInbound: MAX_TEMPLATE_DELAY_SEC + 1,
        otherConversationEchoes: [INSTANT_REPLY_B],
      })
    ).toBe(false);
  });

  it("leaves a genuine merchant reply alone, even a long fast one past the window", () => {
    // Kim's real reply to Melanie, 3 minutes after the customer wrote.
    expect(
      isAutomatedTemplate({
        text: "Hello! Thank you for reaching out! Here's the link to the dress. I hope you and daughter are doing well.",
        secondsSinceInbound: 180,
        otherConversationEchoes: [INSTANT_REPLY_A, AWAY_MESSAGE_A],
      })
    ).toBe(false);
  });

  it("does not fire when the delay is unknown", () => {
    expect(
      isAutomatedTemplate({
        text: INSTANT_REPLY_A,
        secondsSinceInbound: null,
        otherConversationEchoes: [INSTANT_REPLY_B],
      })
    ).toBe(false);
  });

  it("never fires on a short reply, even repeated verbatim and instant", () => {
    // Kim really did send this to two people. A greeting a merchant reuses
    // must not be mistaken for Meta's automation.
    expect(
      isAutomatedTemplate({
        text: HUMAN_SHORT,
        secondsSinceInbound: 1,
        otherConversationEchoes: [HUMAN_SHORT],
      })
    ).toBe(false);
  });

  it("does not fire on a long human reply that is unlike the others", () => {
    // 45 seconds, which is about the fastest a person could read this and type
    // nineteen words back. The fixture used to say 4 seconds, which asserted
    // something physically impossible and only passed because repetition was
    // mandatory.
    expect(
      isAutomatedTemplate({
        text: "Yes we still have the rust polka dot dress in a medium, want me to hold one back for you?",
        secondsSinceInbound: 45,
        otherConversationEchoes: [INSTANT_REPLY_A, AWAY_MESSAGE_A],
      })
    ).toBe(false);
  });

  // Known and accepted: a merchant who taps a long Instagram saved reply can
  // match a template on speed, because tapping is as fast as a server. They
  // would then get our reply alongside theirs. A saved reply is itself canned,
  // and the alternative is the bug this rule exists to fix, so this is the
  // tradeoff rather than an oversight.
  it("cannot distinguish a tapped saved reply from a template, by design", () => {
    expect(
      isAutomatedTemplate({
        text: "Thanks for your order! It will ship within two business days and you will get tracking by email.",
        secondsSinceInbound: 2,
        otherConversationEchoes: [],
      })
    ).toBe(true);
  });

  it("ignores media-only echoes", () => {
    expect(
      isAutomatedTemplate({
        text: null,
        secondsSinceInbound: 2,
        otherConversationEchoes: [INSTANT_REPLY_A],
      })
    ).toBe(false);
  });

  it("tolerates being called with nothing", () => {
    expect(isAutomatedTemplate()).toBe(false);
  });
});

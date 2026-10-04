import { describe, it, expect } from "vitest";
import {
  echoWords,
  echoSimilarity,
  isAutomatedTemplate,
  MAX_TEMPLATE_DELAY_SEC,
} from "../app/lib/echo-classify";

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

  // The expensive mistake would be talking over a real merchant, so each
  // condition is checked on its own.
  it("does not fire the first time a template is seen", () => {
    expect(
      isAutomatedTemplate({
        text: INSTANT_REPLY_A,
        secondsSinceInbound: 3,
        otherConversationEchoes: [],
      })
    ).toBe(false);
  });

  it("does not fire on a slow reply, however repetitive", () => {
    expect(
      isAutomatedTemplate({
        text: INSTANT_REPLY_A,
        secondsSinceInbound: MAX_TEMPLATE_DELAY_SEC + 1,
        otherConversationEchoes: [INSTANT_REPLY_B],
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
    expect(
      isAutomatedTemplate({
        text: "Yes we still have the rust polka dot dress in a medium, want me to hold one back for you?",
        secondsSinceInbound: 4,
        otherConversationEchoes: [INSTANT_REPLY_A, AWAY_MESSAGE_A],
      })
    ).toBe(false);
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

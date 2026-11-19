import { describe, expect, it } from "vitest";
import {
  APP_ACTIONS,
  INSIGHTS_ASSIGN_CHUNK,
  INSIGHTS_MANUAL_COOLDOWN_MS,
  INSIGHTS_REFRESH_MS,
  MAX_TOPIC_IDS,
  assignByKeywords,
  buildActionsPrompt,
  buildAssignmentPrompt,
  buildInsightData,
  buildTopicDiscoveryPrompt,
  buildTopics,
  canRefreshManually,
  isInsightDue,
  oneLine,
  parseAssignments,
  parseDiscoveredTopics,
  parseInsightActions,
  productFlag,
  repeatedPhrases,
  runInsightPipeline,
} from "../app/lib/insights";
import { PLANS } from "../app/lib/plans";

const msg = (id, text) => ({ id, text, channel: "comment", ai_intent: "purchase" });

describe("oneLine", () => {
  it("never leaves half an emoji, which OpenAI rejects as invalid JSON", () => {
    const out = oneLine("ab😍cd", 3);
    expect(out).toBe("ab😍");
    expect(JSON.stringify(out)).not.toMatch(/\\ud8|\\udc/i);
  });
  it("removes lone surrogates already in the text", () => {
    expect(oneLine("hi \uD83D there", 50)).toBe("hi there");
  });
});

describe("repeatedPhrases", () => {
  it("counts short repeated answers, ignoring case, punctuation, and emoji", () => {
    const messages = ["Cranberry", "cranberry!", "Cranberry ❤️", "Hourglass", "hourglass", "HOURGLASS", "a much longer message about many things"]
      .map((t, i) => msg(`m${i}`, t));
    expect(repeatedPhrases(messages)).toEqual([
      { phrase: "cranberry", count: 3 },
      { phrase: "hourglass", count: 3 },
    ]);
  });
});

describe("parseDiscoveredTopics", () => {
  it("keeps at most six, normalizes keywords, and lets no keyword belong to two topics", () => {
    const raw = {
      topics: [
        { label: "Answers", kind: "interest", keywords: ["Cranberry", "x", "hourglass"] },
        { label: "Other", kind: "nonsense", keywords: ["cranberry", "polish"] },
        ...Array.from({ length: 6 }, (_, i) => ({ label: `T${i}` })),
      ],
    };
    const topics = parseDiscoveredTopics(raw);
    expect(topics).toHaveLength(6);
    expect(topics[0].keywords).toEqual(["cranberry", "hourglass"]);
    expect(topics[1].keywords).toEqual(["polish"]);
    expect(topics[1].kind).toBe("question");
  });
  it("survives garbage", () => {
    expect(parseDiscoveredTopics(null)).toEqual([]);
    expect(parseDiscoveredTopics({ topics: [{ keywords: ["a"] }] })).toEqual([]);
  });
});

describe("assignByKeywords", () => {
  const topics = [
    { label: "Berry", keywords: ["berry"] },
    { label: "Answers", keywords: ["cranberry", "hourglass"] },
    { label: "Shipping", keywords: ["ship to canada"] },
  ];
  it("matches whole words only, so berry never claims cranberry", () => {
    const out = assignByKeywords(topics, [msg("a", "Cranberry!"), msg("b", "what about berry?"), msg("c", "strawberry")]);
    expect(out).toEqual([1, 0, -1]);
  });
  it("prefers the longest matching keyword and leaves misses for the model", () => {
    const out = assignByKeywords(topics, [
      msg("a", "Do you ship to Canada? berry"),
      msg("b", "love it"),
    ]);
    expect(out).toEqual([2, -1]);
  });
});

describe("parseAssignments", () => {
  it("reads by key, so a skipped answer does not shift the rest", () => {
    expect(parseAssignments({ assignments: { 0: 1, 2: 0 } }, 3, 2)).toEqual([1, -1, 0]);
  });
  it("rejects out-of-range topics and non-object answers", () => {
    expect(parseAssignments({ assignments: { 0: 5, 1: -3, 2: "1" } }, 3, 2)).toEqual([-1, -1, 1]);
    expect(parseAssignments({ assignments: [0, 1, 0] }, 3, 2)).toEqual([-1, -1, -1]);
    expect(parseAssignments(null, 2, 2)).toEqual([-1, -1]);
  });
});

describe("buildTopics", () => {
  const discovered = [
    { label: "Small", kind: "question", summary: "s" },
    { label: "Lonely", kind: "question", summary: "l" },
    { label: "Big", kind: "interest", summary: "b" },
  ];
  it("counts from assignments, drops topics under two messages, sorts by size", () => {
    const messages = Array.from({ length: 6 }, (_, i) => msg(`m${i}`, "x"));
    const topics = buildTopics(discovered, [0, 0, 1, 2, 2, 2], messages);
    expect(topics.map((t) => [t.label, t.count])).toEqual([["Big", 3], ["Small", 2]]);
    expect(topics[0].messageIds).toEqual(["m3", "m4", "m5"]);
  });
  it("caps stored ids but keeps the real count", () => {
    const messages = Array.from({ length: 60 }, (_, i) => msg(`m${i}`, "x"));
    const [topic] = buildTopics(discovered, new Array(60).fill(2), messages);
    expect(topic.count).toBe(60);
    expect(topic.messageIds).toHaveLength(MAX_TOPIC_IDS);
  });
});

describe("parseInsightActions", () => {
  const topics = [{ label: "A", count: 3 }, { label: "B", count: 2 }];
  it("keeps valid topic references and drops bad ones", () => {
    const actions = parseInsightActions(
      { actions: [{ title: "x", topic: 1 }, { title: "y", topic: 9 }, { title: "z", topic: null }] },
      topics,
    );
    expect(actions.map((a) => a.topic)).toEqual([1, null, null]);
  });
  it("keeps at most three and defaults unknown kinds", () => {
    const actions = parseInsightActions({ actions: [1, 2, 3, 4].map((i) => ({ title: `a${i}`, kind: "weird" })) }, []);
    expect(actions).toHaveLength(3);
    expect(actions[0].kind).toBe("content");
  });
});

describe("prompts", () => {
  const store = { name: "Shop", hasShippingPolicy: true, hasRefundPolicy: false };
  const products = [{ title: "Linen Set", messages: 12, clicked: 0, orders: 0, flag: "asked_no_clicks" }];
  it("discovery shows repeats, products, and policies, and forbids counts", () => {
    const messages = ["Cranberry", "cranberry", "Cranberry", "does it\ncome in XL?"].map((t, i) => msg(`m${i}`, t));
    const p = buildTopicDiscoveryPrompt({ messages, products, store });
    expect(p).toContain('"cranberry" (3 times)');
    expect(p).toContain("[3] (comment, purchase) does it come in XL?");
    expect(p).toContain("Linen Set: 12 conversations got a link, 0 opened it, 0 orders [asked_no_clicks]");
    expect(p).toContain("Return policy published: no");
    expect(p).toMatch(/Never write counts/);
  });
  it("assignment asks for a keyed answer covering every message", () => {
    const p = buildAssignmentPrompt([{ label: "A", description: "d" }], [msg("a", "x"), msg("b", "y")]);
    expect(p).toContain("from 0 to 1");
  });
  it("actions list only real app settings and give the real counts", () => {
    const p = buildActionsPrompt({ topics: [{ label: "Sizing", count: 7, summary: "s" }], products, store });
    expect(p).toContain("0. Sizing (7 messages)");
    for (const a of APP_ACTIONS) expect(p).toContain(a);
  });
});

describe("runInsightPipeline", () => {
  it("sorts by keyword first and only sends the rest to the model, in chunks", async () => {
    const messages = [
      ...Array.from({ length: 50 }, (_, i) => msg(`c${i}`, "Cranberry")),
      ...Array.from({ length: 45 }, (_, i) => msg(`o${i}`, `do you ship to the uk ${i}`)),
    ];
    const prompts = [];
    const ask = async (prompt) => {
      prompts.push(prompt);
      if (prompt.includes("Name the")) {
        return {
          topics: [
            { label: "Cranberry answers", kind: "interest", keywords: ["cranberry"] },
            { label: "UK shipping", kind: "question", keywords: [] },
          ],
        };
      }
      if (prompt.includes("Sort each")) {
        const n = (prompt.match(/^\[\d+\]/gm) || []).length;
        return { assignments: Object.fromEntries(Array.from({ length: n }, (_, i) => [i, 1])) };
      }
      return { actions: [{ title: "Post a UK shipping story", kind: "content", topic: 1 }] };
    };
    const result = await runInsightPipeline({ messages, products: [], store: {}, ask });
    expect(result.aiFailed).toBe(false);
    expect(result.topics.map((t) => [t.label, t.count])).toEqual([["Cranberry answers", 50], ["UK shipping", 45]]);
    const sortPrompts = prompts.filter((p) => p.includes("Sort each"));
    expect(sortPrompts).toHaveLength(Math.ceil(45 / INSIGHTS_ASSIGN_CHUNK));
    expect(sortPrompts.join("")).not.toContain("purchase) Cranberry");
    expect(result.actions[0].topic).toBe(1);
  });

  it("reports a failed first step instead of an empty success", async () => {
    const result = await runInsightPipeline({ messages: [msg("a", "x")], products: [], store: {}, ask: async () => null });
    expect(result).toEqual({ topics: [], actions: [], aiFailed: true });
  });
});

describe("productFlag", () => {
  it("flags selling, clicks without sales, and links nobody opened", () => {
    expect(productFlag({ messages: 139, clicked: 21, orders: 1 })).toBe("selling");
    expect(productFlag({ messages: 30, clicked: 5, orders: 0 })).toBe("clicks_no_sales");
    expect(productFlag({ messages: 17, clicked: 0, orders: 0 })).toBe("asked_no_clicks");
    expect(productFlag({ messages: 3, clicked: 0, orders: 0 })).toBeNull();
    expect(productFlag({ messages: 19, clicked: 1, orders: 0 })).toBeNull();
  });
});

describe("refresh timing", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  it("is due with no row or a week-old row", () => {
    expect(isInsightDue(null, now)).toBe(true);
    expect(isInsightDue({ generated_at: new Date(now - INSIGHTS_REFRESH_MS).toISOString() }, now)).toBe(true);
    expect(isInsightDue({ generated_at: new Date(now - 60_000).toISOString() }, now)).toBe(false);
  });
  it("allows one manual refresh a day", () => {
    expect(canRefreshManually(null, now)).toBe(true);
    expect(canRefreshManually({ generated_at: new Date(now - 60_000).toISOString() }, now)).toBe(false);
    expect(
      canRefreshManually({ generated_at: new Date(now - INSIGHTS_MANUAL_COOLDOWN_MS).toISOString() }, now),
    ).toBe(true);
  });
});

describe("buildInsightData", () => {
  it("stores ids and labels but no message text", () => {
    const messages = [msg("m0", "secret customer text"), msg("m1", "another one")];
    const topics = buildTopics([{ label: "Sizing", kind: "question", summary: "s" }], [0, 0], messages);
    const data = buildInsightData({ stats: { total: 50, relevant: 40 }, products: [], topics, actions: [], sampled: 2 });
    expect(JSON.stringify(data)).not.toContain("secret customer text");
    expect(data.relevant).toBe(40);
  });
});

describe("plan flag", () => {
  it("is Pro only", () => {
    expect(PLANS.PRO.insights).toBe(true);
    expect(PLANS.GROWTH.insights).toBe(false);
    expect(PLANS.FREE.insights).toBe(false);
  });
});

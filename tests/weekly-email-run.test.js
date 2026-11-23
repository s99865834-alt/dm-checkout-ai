/**
 * The real weekly run, with the database and Postmark mocked: what reaches
 * merchants must be the plain email, never a test copy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const writes = [];
vi.mock("../app/lib/supabase.server", () => {
  const from = (table) => ({
    insert: (row) => ({
      select: () => ({
        single: async () => {
          writes.push({ table, op: "insert", row });
          return { data: { id: `row-${row.shop_id}` }, error: null };
        },
      }),
    }),
    update: (row) => ({
      eq: async () => {
        writes.push({ table, op: "update", row });
        return { error: null };
      },
    }),
  });
  return { default: { from } };
});
vi.mock("../app/lib/postmark.server", () => ({
  postmarkConfigured: () => true,
  sendBatch: vi.fn(async (messages) => messages.map((_, i) => ({ ok: true, messageId: `pm-${i}` }))),
}));

const { sendWeeklyEmails } = await import("../app/lib/weekly-email.server");
const { sendBatch } = await import("../app/lib/postmark.server");

const item = (id, subject) => ({
  shop: { id },
  facts: { email: `${id}@shop.test` },
  decision: { send: true, kind: "report", extras: [] },
  links: { unsubscribe: "{{{ pm:unsubscribe }}}" },
  email: { subject, html: "<p>h</p>", text: "t" },
});
const build = async () => ({
  weekStart: "2026-11-23",
  items: [item("a", "Your week on Instagram: 5 questions answered"), item("b", "2 orders from Instagram this week")],
});

describe("sendWeeklyEmails", () => {
  beforeEach(() => {
    writes.length = 0;
    sendBatch.mockClear();
    vi.stubEnv("WEEKLY_EMAIL_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sends the real subjects, with no test prefix", async () => {
    const res = await sendWeeklyEmails({ build });

    expect(res).toMatchObject({ sent: 2, failed: 0 });
    const messages = sendBatch.mock.calls[0][0];
    expect(messages.map((m) => m.subject)).toEqual([
      "Your week on Instagram: 5 questions answered",
      "2 orders from Instagram this week",
    ]);
    for (const m of messages) {
      expect(m.subject).not.toContain("[Test]");
      expect(m.metadata.test).toBeUndefined();
      expect(m.unsubscribeUrl).toBeUndefined();
    }
  });

  it("claims each shop's week before sending and records the result", async () => {
    await sendWeeklyEmails({ build });

    expect(writes.filter((w) => w.op === "insert").map((w) => w.row.shop_id)).toEqual(["a", "b"]);
    expect(writes.filter((w) => w.op === "update").every((w) => w.row.status === "sent")).toBe(true);
  });

  it("sends nothing while switched off", async () => {
    vi.stubEnv("WEEKLY_EMAIL_ENABLED", "");
    expect(await sendWeeklyEmails({ build })).toEqual({ skipped: "Weekly email is not enabled" });
    expect(sendBatch).not.toHaveBeenCalled();
  });
});

/**
 * The hourly "first 10 answered" run, with the database and Postmark mocked:
 * a store is claimed before it is emailed, so it is emailed once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const writes = [];
let insertError = null;
vi.mock("../app/lib/supabase.server", () => {
  const chain = (table, op, row) => {
    const c = {
      eq: () => c,
      select: () => c,
      maybeSingle: async () => {
        writes.push({ table, op, row });
        return { data: null, error: null };
      },
      then: (resolve) => {
        writes.push({ table, op, row });
        return Promise.resolve({ error: null }).then(resolve);
      },
    };
    return c;
  };
  const from = (table) => ({
    insert: async (row) => {
      writes.push({ table, op: "insert", row });
      return { error: insertError };
    },
    update: (row) => chain(table, "update", row),
  });
  return { default: { from } };
});
vi.mock("../app/lib/db.server", () => ({}));
vi.mock("../app/lib/insights.server", () => ({}));
vi.mock("../app/lib/postmark.server", () => ({
  postmarkConfigured: () => true,
  sendBatch: vi.fn(async (messages) => messages.map((_, i) => ({ ok: true, messageId: `pm-${i}` }))),
}));

const { sendMilestoneEmails, milestoneEmailEnabled } = await import("../app/lib/milestone-email.server");
const { sendBatch } = await import("../app/lib/postmark.server");

const item = (id, send = true) => ({
  shop: { id },
  facts: { email: `${id}@shop.test` },
  decision: send ? { send: true } : { send: false, reason: "9 answered so far" },
  links: { unsubscribe: "{{{ pm:unsubscribe }}}" },
  email: send ? { subject: "Your AI has answered 10 customer questions", html: "<p>h</p>", text: "t" } : null,
});

describe("sendMilestoneEmails", () => {
  beforeEach(() => {
    writes.length = 0;
    insertError = null;
    sendBatch.mockClear();
    vi.stubEnv("WEEKLY_EMAIL_ENABLED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("claims each store, sends, and records it as sent", async () => {
    const res = await sendMilestoneEmails({ build: async () => [item("a"), item("b", false)] });
    expect(res).toMatchObject({ sent: 1, failed: 0, considered: 2 });
    expect(writes.filter((w) => w.op === "insert").map((w) => w.row)).toEqual([
      { shop_id: "a", milestone: "first_10_answered", recipient: "a@shop.test", status: "pending" },
    ]);
    expect(writes.some((w) => w.op === "update" && w.row.status === "sent")).toBe(true);
    const [message] = sendBatch.mock.calls[0][0];
    expect(message.subject).not.toContain("[Test]");
    expect(message.metadata).toEqual({ shop_id: "a", kind: "first_10_answered" });
  });

  it("does not send when another run already claimed the store", async () => {
    insertError = { code: "23505", message: "duplicate key" };
    const res = await sendMilestoneEmails({ build: async () => [item("a")] });
    expect(res).toMatchObject({ sent: 0 });
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it("is off with the weekly email, and can be switched off on its own", async () => {
    vi.stubEnv("WEEKLY_EMAIL_ENABLED", "false");
    expect(milestoneEmailEnabled()).toBe(false);
    vi.stubEnv("WEEKLY_EMAIL_ENABLED", "true");
    vi.stubEnv("MILESTONE_EMAIL_ENABLED", "false");
    expect(milestoneEmailEnabled()).toBe(false);
    expect(await sendMilestoneEmails({ build: async () => [item("a")] })).toEqual({
      skipped: "Milestone email is not enabled",
    });
  });
});

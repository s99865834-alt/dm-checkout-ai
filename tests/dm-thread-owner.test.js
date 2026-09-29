/**
 * A DM on a thread we do not own must not be queued.
 *
 * Meta's handover protocol delivers events for threads owned by someone else
 * on entry.standby, and rejects any send with "not the thread owner" (code
 * 100, subcode 2534037). Usually that someone else is the merchant, answering
 * from their own Instagram inbox.
 *
 * On 29 Sep 2026 the first DM our first paying merchant ever received hit this.
 * It was treated as a transient failure, so it burned three queue attempts and
 * logged a stack trace, and had thread control returned in between, the retry
 * would have sent a stale reply over the top of the merchant's own answer.
 *
 * Returning sent:false makes the callers roll the reply back and skip
 * incrementUsage, so nobody is charged for a message that was never delivered.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  sendError: null,
  canSend: true,
  queued: [],
}));

vi.mock("../app/lib/queue.server", () => ({
  canSendForShop: async () => state.canSend,
  sendDmNow: async () => {
    if (state.sendError) throw state.sendError;
    return { ok: true };
  },
}));

vi.mock("../app/lib/supabase.server", () => ({
  default: {
    from: () => ({
      insert: async (row) => {
        state.queued.push(row);
        return { error: null };
      },
    }),
  },
}));

vi.mock("openai", () => ({ default: class { } }));

const { sendDmReply } = await import("../app/lib/automation.server");

const igError = (message) => Object.assign(new Error(message), {
  meta: { code: 100, error_subcode: 2534037 },
});

beforeEach(() => {
  state.sendError = null;
  state.canSend = true;
  state.queued = [];
});

describe("sendDmReply when the thread is owned elsewhere", () => {
  it("reports a failure the callers can roll back, and queues nothing", async () => {
    state.sendError = igError(
      "Instagram API error: The action is invalid since it's not the thread owner. (Code: 100)",
    );

    const result = await sendDmReply("shop-1", "4792484797485760", "Hi Melanie!");

    expect(result).toEqual({ sent: false, reason: "instagram_not_thread_owner" });
    expect(state.queued).toHaveLength(0);
  });

  it("still queues a genuinely transient failure", async () => {
    state.sendError = new Error("Instagram API error: Please reduce the amount of data (Code: 1)");

    const result = await sendDmReply("shop-1", "4792484797485760", "Hi Melanie!");

    expect(result).toEqual({ queued: true });
    expect(state.queued).toHaveLength(1);
  });

  it("still skips the queue for an unreachable recipient", async () => {
    state.sendError = new Error("Instagram API error: The requested user cannot be found. (Code: 100)");

    const result = await sendDmReply("shop-1", "4792484797485760", "Hi Melanie!");

    expect(result.sent).toBe(false);
    expect(state.queued).toHaveLength(0);
  });

  it("reports sent on the happy path", async () => {
    await expect(sendDmReply("shop-1", "4792484797485760", "Hi Melanie!")).resolves.toEqual({
      sent: true,
    });
  });
});

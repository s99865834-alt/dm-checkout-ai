import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isWeeklySendWindow } from "../app/lib/weekly-email";
import { unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl } from "../app/lib/email-unsubscribe.server";
import { sendBatch, postmarkConfigured } from "../app/lib/postmark.server";

describe("isWeeklySendWindow", () => {
  it("opens Tuesday at 15:00 UTC and closes after Wednesday", () => {
    expect(isWeeklySendWindow(new Date("2026-11-24T14:59:00Z"))).toBe(false);
    expect(isWeeklySendWindow(new Date("2026-11-24T15:00:00Z"))).toBe(true);
    expect(isWeeklySendWindow(new Date("2026-11-25T23:59:00Z"))).toBe(true);
    expect(isWeeklySendWindow(new Date("2026-11-26T00:00:00Z"))).toBe(false);
    expect(isWeeklySendWindow(new Date("2026-11-23T16:00:00Z"))).toBe(false);
  });
});

describe("unsubscribe links", () => {
  beforeEach(() => vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("verifies its own token and nothing else", () => {
    const t = unsubscribeToken("shop-1");
    expect(verifyUnsubscribeToken("shop-1", t)).toBe(true);
    expect(verifyUnsubscribeToken("shop-2", t)).toBe(false);
    expect(verifyUnsubscribeToken("shop-1", "x".repeat(32))).toBe(false);
    expect(verifyUnsubscribeToken("shop-1", undefined)).toBe(false);
  });

  it("builds a link on the given site", () => {
    expect(unsubscribeUrl("https://www.socialrepl.ai/", "shop-1")).toBe(
      `https://www.socialrepl.ai/email/unsubscribe?s=shop-1&t=${unsubscribeToken("shop-1")}`
    );
  });

  it("refuses to build a link without a secret", () => {
    vi.stubEnv("EMAIL_UNSUBSCRIBE_SECRET", "");
    vi.stubEnv("SHOPIFY_API_SECRET", "");
    expect(unsubscribeUrl("https://www.socialrepl.ai", "shop-1")).toBeNull();
  });
});

describe("sendBatch", () => {
  beforeEach(() => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "pm-token");
    vi.stubEnv("EMAIL_FROM", "Stephan <stephan@socialrepl.ai>");
    vi.stubEnv("EMAIL_REPLY_TO", "stephan@socialrepl.ai");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const msg = (to) => ({ to, subject: "s", html: "<p>h</p>", text: "t", unsubscribeUrl: "https://x/u", metadata: { shop_id: to } });

  it("is only configured with a token and a sender", () => {
    expect(postmarkConfigured()).toBe(true);
    vi.stubEnv("EMAIL_FROM", "");
    expect(postmarkConfigured()).toBe(false);
  });

  it("sends on the broadcast stream with one-click unsubscribe headers", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ ErrorCode: 0, MessageID: "m1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const [result] = await sendBatch([msg("a@test.com")]);

    expect(result).toEqual({ ok: true, messageId: "m1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.postmarkapp.com/email/batch");
    expect(init.headers["X-Postmark-Server-Token"]).toBe("pm-token");
    const [body] = JSON.parse(init.body);
    expect(body).toMatchObject({ To: "a@test.com", MessageStream: "broadcast", ReplyTo: "stephan@socialrepl.ai", Metadata: { shop_id: "a@test.com" } });
    expect(body.Headers).toEqual([
      { Name: "List-Unsubscribe", Value: "<https://x/u>" },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    ]);
  });

  it("reports per-message errors in order", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ ErrorCode: 0, MessageID: "m1" }, { ErrorCode: 406, Message: "Inactive recipient" }],
    })));

    const results = await sendBatch([msg("a@test.com"), msg("b@test.com")]);

    expect(results).toEqual([{ ok: true, messageId: "m1" }, { ok: false, error: "406: Inactive recipient" }]);
  });

  it("fails every message in a rejected batch without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ Message: "Bad token" }) })));

    const results = await sendBatch([msg("a@test.com"), msg("b@test.com")]);

    expect(results).toEqual([
      { ok: false, error: "Postmark 401: Bad token" },
      { ok: false, error: "Postmark 401: Bad token" },
    ]);
  });
});

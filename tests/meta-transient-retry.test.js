/**
 * Transient-error retry tests for the Meta Graph API helpers.
 *
 * These exist because on Aug 20-21 2026 three comment replies on a live
 * account were permanently lost: Meta returned its transient "An unexpected
 * error has occurred. Please retry your request later." (code 2,
 * is_transient: true) and the pipeline had no retry — and the claim row
 * written before the send blocks reprocessing, so one Meta hiccup = one
 * customer never answered. The helpers must retry transient errors and
 * still fail fast on real ones.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../app/lib/crypto.server", () => ({
  encryptToken: (v) => v,
  decryptToken: (v) => v,
}));

vi.mock("../app/lib/supabase.server", () => ({
  default: { from: () => ({}), rpc: async () => ({ data: null, error: null }) },
}));

import { metaGraphAPIInstagram, metaGraphAPI } from "../app/lib/meta.server";

function jsonResponse(payload) {
  return { json: async () => payload };
}

const TRANSIENT_ERROR = {
  error: {
    message: "An unexpected error has occurred. Please retry your request later.",
    type: "OAuthException",
    is_transient: true,
    code: 2,
  },
};

const PERMANENT_ERROR = {
  error: {
    message: "The comment you are trying to reply to, already has a reply.",
    type: "OAuthException",
    code: 100,
    error_subcode: 2534023,
  },
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("metaGraphAPIInstagram transient retry", () => {
  it("retries a transient error and returns the eventual success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TRANSIENT_ERROR))
      .mockResolvedValueOnce(jsonResponse({ message_id: "sent-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = metaGraphAPIInstagram("/123/messages", "token", { method: "POST", body: {} });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ message_id: "sent-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries and preserves the raw error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(TRANSIENT_ERROR));
    vi.stubGlobal("fetch", fetchMock);

    const promise = metaGraphAPIInstagram("/123/messages", "token", { method: "POST", body: {} });
    // Attach the rejection handler before advancing timers so the rejection
    // is never unhandled.
    const assertion = expect(promise).rejects.toMatchObject({
      meta: { code: 2, is_transient: true },
    });
    await vi.runAllTimersAsync();
    await assertion;

    // 1 initial attempt + 2 retries
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry a permanent error (fails fast, keeps subcode)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PERMANENT_ERROR));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      metaGraphAPIInstagram("/123/messages", "token", { method: "POST", body: {} })
    ).rejects.toMatchObject({ meta: { error_subcode: 2534023 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("metaGraphAPI (Facebook Login) transient retry", () => {
  it("retries a transient error and returns the eventual success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(TRANSIENT_ERROR))
      .mockResolvedValueOnce(jsonResponse({ id: "ok" }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = metaGraphAPI("/me", "token");
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ id: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a permanent error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(PERMANENT_ERROR));
    vi.stubGlobal("fetch", fetchMock);

    await expect(metaGraphAPI("/me", "token")).rejects.toThrow(/Code: 100/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

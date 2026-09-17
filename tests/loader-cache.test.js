import { afterEach, describe, expect, it } from "vitest";
import { cached, invalidateCached } from "../app/lib/loader-cache.server.js";

const PREFIX = "test-cache-";

describe("cached", () => {
  afterEach(() => {
    invalidateCached(PREFIX);
  });

  it("returns the stored value on a second call within the TTL", async () => {
    const key = `${PREFIX}hit`;
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return "v1";
    };
    await expect(cached(key, 60_000, fn)).resolves.toBe("v1");
    await expect(cached(key, 60_000, fn)).resolves.toBe("v1");
    expect(calls).toBe(1);
  });

  it("runs one fetch when several callers miss at the same time", async () => {
    const key = `${PREFIX}coalesce`;
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const fn = async () => {
      calls += 1;
      await gate;
      return "shared";
    };

    const pending = [
      cached(key, 60_000, fn),
      cached(key, 60_000, fn),
      cached(key, 60_000, fn),
    ];
    release();
    const values = await Promise.all(pending);
    expect(calls).toBe(1);
    expect(values).toEqual(["shared", "shared", "shared"]);
  });

  it("does not cache a failed fetch, so the next caller retries", async () => {
    const key = `${PREFIX}fail`;
    let calls = 0;
    await expect(
      cached(key, 60_000, async () => {
        calls += 1;
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");
    await expect(
      cached(key, 60_000, async () => {
        calls += 1;
        return "ok";
      }),
    ).resolves.toBe("ok");
    expect(calls).toBe(2);
  });
});

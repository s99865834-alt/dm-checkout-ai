import { afterEach, describe, expect, it } from "vitest";
import { cached, peekCached, invalidateCached } from "../app/lib/loader-cache.server.js";

const PREFIX = "test-cache-";

// The home loader serves message-access inline when it is warm and answers
// "pending" when it is not, rather than waiting on a live Meta probe. That
// only works if a peek can tell a miss from a cached falsy value, and never
// runs the expensive function itself.
describe("peekCached", () => {
  afterEach(() => {
    invalidateCached(PREFIX);
  });

  it("returns undefined on a miss without running anything", () => {
    expect(peekCached(`${PREFIX}absent`)).toBeUndefined();
  });

  it("returns a warm value", async () => {
    const key = `${PREFIX}warm`;
    await cached(key, 60_000, async () => "on");
    expect(peekCached(key)).toBe("on");
  });

  it("tells a cached falsy value apart from a miss", async () => {
    const key = `${PREFIX}falsy`;
    await cached(key, 60_000, async () => null);
    expect(peekCached(key)).toBeNull();
    expect(peekCached(`${PREFIX}nothing-here`)).toBeUndefined();
  });

  it("treats an expired entry as a miss", async () => {
    const key = `${PREFIX}expired`;
    await cached(key, 1, async () => "stale");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(peekCached(key)).toBeUndefined();
  });

  it("does not populate the cache", () => {
    const key = `${PREFIX}peek-only`;
    expect(peekCached(key)).toBeUndefined();
    expect(peekCached(key)).toBeUndefined();
  });
});

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

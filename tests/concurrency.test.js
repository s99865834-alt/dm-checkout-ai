import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "../app/lib/concurrency";
import { runExclusive } from "../app/lib/prisma-exclusive";

describe("mapWithConcurrency", () => {
  it("keeps results in input order", async () => {
    const settled = await mapWithConcurrency([3, 1, 2], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n * 5));
      return n * 10;
    });
    expect(settled.map((s) => s.value)).toEqual([30, 10, 20]);
  });

  it("never runs more than the limit at once", async () => {
    let inflight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 2, async () => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight -= 1;
    });
    expect(peak).toBe(2);
  });

  it("captures a thrown item without aborting the rest", async () => {
    const settled = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    expect(settled[0]).toEqual({ status: "fulfilled", value: 1 });
    expect(settled[1].status).toBe("rejected");
    expect(settled[2]).toEqual({ status: "fulfilled", value: 3 });
  });

  it("returns an empty array for an empty input", async () => {
    expect(await mapWithConcurrency([], 4, async (n) => n)).toEqual([]);
  });
});

describe("runExclusive", () => {
  it("runs overlapping work one at a time", async () => {
    let inflight = 0;
    let peak = 0;
    const job = async () => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 10));
      inflight -= 1;
    };
    await Promise.all([runExclusive(job), runExclusive(job), runExclusive(job)]);
    expect(peak).toBe(1);
  });
});

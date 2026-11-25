/**
 * The check for a reply that asks the customer for something they already
 * gave. A small model said yes to 19 of 46 real replies when asked plainly,
 * so a yes only counts with a quote of the customer's own words that really
 * is in their messages, and only runs once they have given a specific detail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let answer = "{}";
const calls = [];
vi.mock("openai", () => ({
  default: class OpenAI {
    constructor() {
      this.chat = {
        completions: {
          create: async (params) => {
            calls.push(params);
            if (answer instanceof Error) throw answer;
            return { choices: [{ message: { content: answer } }] };
          },
        },
      };
    }
  },
}));

const { repeatsWhatCustomerSaid } = await import("../app/lib/ai.server");
const { namesSpecificDetail } = await import("../app/lib/variant-match");

const customerMessages = ["عندكم كفرات ايباد", "ايباد برو 11 انش m1"];
const reply = "لو تقدر تعطيني رقم الموديل اللي مكتوب ورا الايباد";

beforeEach(() => {
  calls.length = 0;
});

describe("repeatsWhatCustomerSaid", () => {
  it("says yes when the quote is the customer's own words", async () => {
    answer = JSON.stringify({ repeats: true, what: "iPad model", quote: "ايباد برو 11 انش m1" });
    expect(await repeatsWhatCustomerSaid({ customerMessages, reply })).toEqual({
      repeats: true,
      what: "iPad model",
      quote: "ايباد برو 11 انش m1",
    });
  });

  it("says no when the quote is not in their messages", async () => {
    answer = JSON.stringify({ repeats: true, what: "iPad model", quote: "iPad Pro 12.9" });
    expect((await repeatsWhatCustomerSaid({ customerMessages, reply })).repeats).toBe(false);
  });

  it("says no without a quote", async () => {
    answer = JSON.stringify({ repeats: true, what: "iPad model", quote: null });
    expect((await repeatsWhatCustomerSaid({ customerMessages, reply })).repeats).toBe(false);
  });

  it("says no when the check fails, so a reply is never held up", async () => {
    answer = new Error("timeout");
    expect((await repeatsWhatCustomerSaid({ customerMessages, reply })).repeats).toBe(false);
    answer = "not json";
    expect((await repeatsWhatCustomerSaid({ customerMessages, reply })).repeats).toBe(false);
  });

  it("uses gpt-4.1-mini", async () => {
    answer = JSON.stringify({ repeats: false });
    await repeatsWhatCustomerSaid({ customerMessages, reply });
    expect(calls[0].model).toBe("gpt-4.1-mini");
  });
});

describe("namesSpecificDetail", () => {
  it("is true for a number in any numeral system", () => {
    expect(namesSpecificDetail(["ايباد برو 11 انش m1"])).toBe(true);
    expect(namesSpecificDetail(["آيباد ١١برو ٢٠٢١"])).toBe(true);
  });

  it("is true for an option value of a product looked up this turn", () => {
    expect(namesSpecificDetail(["the blue one please"], ["Blue", "Red"])).toBe(true);
  });

  it("is false for a general question, and for the digits in a link", () => {
    expect(namesSpecificDetail(["How much for tab case?", "عندكم كفرات ايباد"])).toBe(false);
    expect(namesSpecificDetail(["https://www.instagram.com/reel/DgJ-wx-hhku/?dmpr=MWtx64", "بكم"])).toBe(false);
  });
});

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = join(__dirname, "..", "app");

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(js|jsx|ts|tsx)$/.test(name) ? [path] : [];
  });
}

const MODEL_CALL = /chat\.completions\.create\(/g;
const PRICE_CHECK = /(?<!function )\b(?:enforcePrices|withoutInventedPrices)\(/g;
const count = (src, re) => (src.match(re) || []).length;

// A wrong price in a DM goes out in the merchant's name: $1,500 for a $15 jar,
// 75 OMR for a 7.500 OMR case. Every model call that writes text a customer
// reads must pass its output through the price check in price-guard.js, so a
// new reply path has to be added here deliberately.
describe("price guardrail", () => {
  const callers = sourceFiles(APP_DIR)
    .filter((path) => count(readFileSync(path, "utf8"), MODEL_CALL) > 0)
    .map((path) => relative(APP_DIR, path))
    .sort();

  it("only known files call the model", () => {
    expect(callers).toEqual([
      // Message classification and merchant insights; no customer reads these.
      "lib/ai.server.js",
      "lib/automation.server.js",
      "lib/followup.server.js",
      "lib/sales-agent.server.js",
    ]);
  });

  it.each(["lib/automation.server.js", "lib/followup.server.js", "lib/sales-agent.server.js"])(
    "%s checks prices at least once per model call",
    (file) => {
      const src = readFileSync(join(APP_DIR, file), "utf8");
      expect(count(src, PRICE_CHECK)).toBeGreaterThanOrEqual(count(src, MODEL_CALL));
    }
  );
});

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

function filesMatching(pattern) {
  return sourceFiles(APP_DIR)
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(APP_DIR, path))
    .sort();
}

// Deactivating a shop or deleting its Shopify session switches off its
// Instagram replies. Only Shopify's own uninstall signal may do either; a
// background job guessing from an error code must never be added here.
describe("uninstall guardrail", () => {
  it("only the uninstall webhook marks a shop uninstalled", () => {
    expect(filesMatching(/\bmarkShopUninstalled\s*\(/)).toEqual([
      "lib/db.server.js",
      "routes/webhooks.app.uninstalled.jsx",
    ]);
  });

  it("only uninstall webhook paths delete Shopify sessions", () => {
    expect(filesMatching(/session\.deleteMany\s*\(/)).toEqual([
      "lib/webhook-auth.server.js",
      "routes/webhooks.app.uninstalled.jsx",
    ]);
  });

  it("no code writes active: false to shops outside markShopUninstalled", () => {
    const writers = sourceFiles(APP_DIR)
      .filter((path) => /\.update\(\s*\{[^}]*\bactive:\s*false/s.test(readFileSync(path, "utf8")))
      .map((path) => relative(APP_DIR, path));
    expect(writers).toEqual(["lib/db.server.js"]);
  });
});

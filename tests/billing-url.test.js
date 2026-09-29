/**
 * The Managed Pricing URL is the only way a merchant can pay.
 *
 * It was built with the repo name, "dm-checkout-ai", instead of the app's
 * handle, "socialreplai". Shopify does not error on an unknown app handle in a
 * charges URL, it just bounces the merchant to their Shopify Apps page, so the
 * upgrade button looked like the app crashing and no merchant could subscribe.
 * Every paid shop in the database had been comped by hand, which hid it.
 *
 * The handle lives in shopify.app.toml and is owned by the Partner Dashboard,
 * so this reads it from disk rather than restating it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { APP_HANDLE, managedPricingUrl } from "../app/lib/billing-url.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function handleFromAppToml() {
  const toml = readFileSync(join(repoRoot, "shopify.app.toml"), "utf8");
  return toml.match(/^handle\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

describe("APP_HANDLE", () => {
  it("matches the handle Shopify actually knows this app by", () => {
    const configured = handleFromAppToml();
    expect(configured).toBeTruthy();
    expect(APP_HANDLE).toBe(configured);
  });

  it("is not the repository name, which is what broke it", () => {
    expect(APP_HANDLE).not.toBe("dm-checkout-ai");
  });
});

describe("managedPricingUrl", () => {
  it("points at the store's pricing page for this app", () => {
    expect(managedPricingUrl("lovebyluna.myshopify.com")).toBe(
      `https://admin.shopify.com/store/lovebyluna/charges/${APP_HANDLE}/pricing_plans`,
    );
  });

  it("strips only the myshopify suffix, leaving the store handle intact", () => {
    expect(managedPricingUrl("bys-user-store-582322-njnpcff1.myshopify.com")).toContain(
      "/store/bys-user-store-582322-njnpcff1/charges/",
    );
  });

  it("returns null rather than a broken URL when there is no shop", () => {
    expect(managedPricingUrl("")).toBeNull();
    expect(managedPricingUrl(null)).toBeNull();
    expect(managedPricingUrl(undefined)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { resolveCustomerFacingEmail, extractEmailsFromText } from "../app/lib/contact-email";

const STORE = "lovebyluna.co";

describe("extractEmailsFromText", () => {
  it("pulls mailto addresses out of HTML", () => {
    expect(extractEmailsFromText('email <a href="mailto:info@lovebyluna.co">us</a>')).toEqual([
      "info@lovebyluna.co",
    ]);
  });

  it("drops noreply, shopify, and image-looking matches", () => {
    const text = "noreply@lovebyluna.co owner@shopify.com file@2x.png info@lovebyluna.co";
    expect(extractEmailsFromText(text)).toEqual(["info@lovebyluna.co"]);
  });
});

describe("resolveCustomerFacingEmail", () => {
  it("prefers a contact-page public inbox over the Shopify owner email", () => {
    const resolved = resolveCustomerFacingEmail({
      pages: [
        {
          title: "Contact",
          handle: "contact",
          bodySummary: "Email us at info@lovebyluna.co",
        },
      ],
      contactEmail: "katie@lovebyluna.co",
      shopEmail: "katie@lovebyluna.co",
      storeHost: STORE,
    });
    expect(resolved).toEqual({ email: "info@lovebyluna.co", source: "page" });
  });

  it("prefers a footer info@ over the owner email even when no contact page exists", () => {
    const resolved = resolveCustomerFacingEmail({
      pages: [],
      homepageHtml: '<footer>Questions? <a href="mailto:info@lovebyluna.co">info@lovebyluna.co</a></footer>',
      contactEmail: "katie@lovebyluna.co",
      shopEmail: "katie@lovebyluna.co",
      storeHost: STORE,
    });
    expect(resolved).toEqual({ email: "info@lovebyluna.co", source: "footer" });
  });

  it("prefers footer info@ over a personal address on the contact page", () => {
    const resolved = resolveCustomerFacingEmail({
      pages: [
        {
          title: "Contact",
          handle: "contact-us",
          bodySummary: "Reach Katie at katie@lovebyluna.co",
        },
      ],
      homepageHtml: "info@lovebyluna.co",
      shopEmail: "katie@lovebyluna.co",
      storeHost: STORE,
    });
    expect(resolved.email).toBe("info@lovebyluna.co");
    expect(resolved.source).toBe("footer");
  });

  it("uses Shopify contactEmail before the owner email when the site has no address", () => {
    const resolved = resolveCustomerFacingEmail({
      pages: [],
      homepageHtml: "",
      contactEmail: "info@lovebyluna.co",
      shopEmail: "katie@lovebyluna.co",
      storeHost: STORE,
    });
    expect(resolved).toEqual({ email: "info@lovebyluna.co", source: "contactEmail" });
  });

  it("falls back to the owner email last", () => {
    const resolved = resolveCustomerFacingEmail({
      pages: [],
      shopEmail: "katie@lovebyluna.co",
      storeHost: STORE,
    });
    expect(resolved).toEqual({ email: "katie@lovebyluna.co", source: "shopEmail" });
  });

  it("returns nothing when no plausible address exists", () => {
    const resolved = resolveCustomerFacingEmail({
      pages: [{ title: "Home", bodySummary: "noreply@lovebyluna.co" }],
      shopEmail: "owner@shopify.com",
    });
    expect(resolved).toEqual({ email: null, source: null });
  });
});

import { describe, it, expect } from "vitest";
import {
  buildTrackedLinkPageHtml,
  destinationCarriesCartRef,
  isLinkPreviewCrawler,
  DEFAULT_LINK_PREVIEW,
} from "../app/lib/link-preview.server";

function requestWithUa(ua) {
  return new Request("https://lovebyluna.co/a/go/abc", {
    headers: ua ? { "user-agent": ua } : {},
  });
}

describe("isLinkPreviewCrawler", () => {
  it("treats Facebook and Meta unfurl bots as crawlers", () => {
    expect(
      isLinkPreviewCrawler(
        requestWithUa("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"),
      ),
    ).toBe(true);
    expect(
      isLinkPreviewCrawler(
        requestWithUa("meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)"),
      ),
    ).toBe(true);
  });

  it("does not treat Instagram in-app browsers as crawlers", () => {
    expect(
      isLinkPreviewCrawler(
        requestWithUa(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 10.0.0.0.0",
        ),
      ),
    ).toBe(false);
  });

  it("does not treat Node fetch or GitHub Actions as crawlers", () => {
    expect(isLinkPreviewCrawler(requestWithUa("node"))).toBe(false);
    expect(isLinkPreviewCrawler(requestWithUa("undici"))).toBe(false);
  });
});

describe("buildTrackedLinkPageHtml", () => {
  const destination = "https://lovebyluna.co/cart/123:1?ref=link_abc";

  it("does not use the old Redirecting title", () => {
    const html = buildTrackedLinkPageHtml({ destinationUrl: destination });
    expect(html).not.toMatch(/Redirecting/);
    expect(html).toContain(`<title>${DEFAULT_LINK_PREVIEW.title}</title>`);
    expect(html).toContain(`content="${DEFAULT_LINK_PREVIEW.title}"`);
  });

  it("includes Open Graph title, description, and image when given a product", () => {
    const html = buildTrackedLinkPageHtml({
      destinationUrl: destination,
      title: "The Luna Set",
      description: "The Luna Set on Love By Luna",
      imageUrl: "https://cdn.shopify.com/s/files/1/luna.jpg",
    });
    expect(html).toContain("<title>The Luna Set</title>");
    expect(html).toContain('property="og:title" content="The Luna Set"');
    expect(html).toContain('property="og:image" content="https://cdn.shopify.com/s/files/1/luna.jpg"');
    expect(html).toContain("window.location.replace");
    expect(html).toContain("https://lovebyluna.co/cart/123:1?ref=link_abc");
  });

  it("escapes HTML in titles so a product name cannot break the page", () => {
    const html = buildTrackedLinkPageHtml({
      destinationUrl: destination,
      title: `Cool <script>alert(1)</script> & "Set"`,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("stamps a 30-day last-click cookie and cart attribute on a real click", () => {
    const html = buildTrackedLinkPageHtml({
      destinationUrl: destination,
      persistLastClick: true,
      linkId: "info_abc123def456",
    });
    expect(html).toContain("sr_ref=link_info_abc123def456");
    expect(html).toContain("/cart/update.js");
    expect(html).toContain("fetch(\"/cart.js\"");
    expect(html).toContain("window.location.replace");
  });

  it("waits for the cart stamp before redirecting a real click", () => {
    const html = buildTrackedLinkPageHtml({
      destinationUrl: destination,
      persistLastClick: true,
      linkId: "info_abc123def456",
    });
    expect(html).toContain("clearTimeout");
    expect(html).toContain("Continuing to the store.");
    expect(html).toContain(".then(function(){clearTimeout(timer);go();},function(){clearTimeout(timer);go();})");
    expect(html).toContain("<noscript><meta http-equiv=\"refresh\"");
    const withoutNoscriptRefresh = html.replace("<noscript><meta http-equiv=\"refresh\"", "");
    expect(withoutNoscriptRefresh).not.toContain("http-equiv=\"refresh\"");
  });

  it("keeps an instant refresh when there is no cart stamp to wait for", () => {
    const html = buildTrackedLinkPageHtml({ destinationUrl: destination });
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${destination}">`);
    expect(html).not.toContain("/cart/update.js");
  });

  // A checkout permalink sets attributes[ref] itself and Shopify rebuilds the
  // cart from it, so stopping to POST /cart/update.js only delays the click.
  it("does not delay a checkout permalink that already carries attributes[ref]", () => {
    const permalink =
      "https://lovebyluna.co/cart/123:1?ref=link_TeuHqkwt&attributes%5Bref%5D=link_TeuHqkwt";
    const html = buildTrackedLinkPageHtml({
      destinationUrl: permalink,
      persistLastClick: true,
      linkId: "TeuHqkwt",
    });
    expect(html).toContain("sr_ref=link_TeuHqkwt");
    expect(html).not.toContain("/cart/update.js");
    expect(html).not.toContain("Continuing to the store.");
    expect(html).toContain('http-equiv="refresh"');
    expect(html).not.toContain("<noscript><meta http-equiv=\"refresh\"");
  });

  it("still waits for a browse link, which has no cart attribute of its own", () => {
    const html = buildTrackedLinkPageHtml({
      destinationUrl: "https://lovebyluna.co/collections/all?ref=link_info_abc123def456",
      persistLastClick: true,
      linkId: "info_abc123def456",
    });
    expect(html).toContain("/cart/update.js");
    expect(html).toContain("Continuing to the store.");
  });
});

describe("destinationCarriesCartRef", () => {
  it("recognises the encoded and literal attribute", () => {
    expect(destinationCarriesCartRef("https://x.co/cart/1:1?attributes%5Bref%5D=link_a")).toBe(true);
    expect(destinationCarriesCartRef("https://x.co/cart/1:1?attributes[ref]=link_a")).toBe(true);
  });

  it("is false for a browse or product url", () => {
    expect(destinationCarriesCartRef("https://x.co/collections/all?ref=link_a")).toBe(false);
    expect(destinationCarriesCartRef(null)).toBe(false);
  });
});

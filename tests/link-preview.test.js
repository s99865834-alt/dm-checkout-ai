import { describe, it, expect } from "vitest";
import {
  buildTrackedLinkPageHtml,
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
});

/**
 * Shared nav + footer for public marketing pages (blog, guides).
 * Mirrors the landing page chrome so all pages feel like one site.
 */
export const SHOPIFY_APP_STORE_URL =
  typeof process !== "undefined" && process.env?.SHOPIFY_APP_STORE_URL
    ? process.env.SHOPIFY_APP_STORE_URL
    : "https://apps.shopify.com/socialreplai";

export function Logo({ className = "" }) {
  return (
    <span className={`srLogo ${className}`}>
      <img
        className="srLogoMark"
        src="/landing/icon.svg"
        alt=""
        width="32"
        height="32"
        aria-hidden="true"
      />
      <span className="srLogoText">
        SocialRepl<span className="srLogoTextAccent">.ai</span>
      </span>
    </span>
  );
}

export function MarketingNav() {
  return (
    <header className="srNav">
      <div className="srNavInner">
        <a href="/" className="srNavBrand" aria-label="SocialRepl.ai home">
          <Logo />
        </a>
        <nav className="srNavLinks" aria-label="Primary">
          <a href="/#features">Features</a>
          <a href="/#how-it-works">How it works</a>
          <a href="/#pricing">Pricing</a>
          <a href="/blog">Blog</a>
        </nav>
        <a
          className="srNavCta"
          href={SHOPIFY_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Install free
        </a>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="srFooter">
      <div className="srFooterInner">
        <div className="srFooterBrand">
          <Logo />
          <p className="srFooterTag">AI Instagram replies with checkout links for Shopify.</p>
        </div>
        <div className="srFooterLinks">
          <a href="/#features">Features</a>
          <a href="/#pricing">Pricing</a>
          <a href="/blog">Blog</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href={SHOPIFY_APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            Shopify App Store
          </a>
        </div>
      </div>
      <div className="srFooterMeta">
        © {new Date().getFullYear()} Tennyson Labs · Made for Shopify merchants
      </div>
    </footer>
  );
}

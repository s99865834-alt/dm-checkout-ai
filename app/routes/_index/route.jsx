import { redirect } from "react-router";
import { useState } from "react";

// Replace with your actual Shopify App Store listing URL once live (e.g. https://apps.shopify.com/dm-checkout-ai)
const SHOPIFY_APP_STORE_URL =
  typeof process !== "undefined" && process.env?.SHOPIFY_APP_STORE_URL
    ? process.env.SHOPIFY_APP_STORE_URL
    : "https://apps.shopify.com/";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    if (url.searchParams.get("instagram_connected")) {
      const shop = url.searchParams.get("shop");
      throw redirect(`/app?connected=true&shop=${encodeURIComponent(shop || "")}`);
    }
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return {};
};

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    // TODO: Wire to your email provider (Mailchimp, ConvertKit, Supabase, etc.) or add a Remix action
    setEmailSubmitted(true);
  };

  return (
    <div className="srMarketingLanding">
      <section className="srMarketingHero">
        <h1>Transform Instagram DMs and comments into sales</h1>
        <p>
          DM Checkout AI sends AI-powered automated replies with one-click
          checkout links—so you never miss a DM sale.
        </p>
        <a
          className="srMarketingCta"
          href={SHOPIFY_APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Install from Shopify App Store
        </a>
      </section>

      <section className="srMarketingSection">
        <h2>How it works</h2>
        <ul className="srMarketingFeatures">
          <li>Connect your Instagram Business account to your Shopify store.</li>
          <li>Map products to your Instagram posts so the app knows what to link.</li>
          <li>When someone DMs or comments, get a personalized reply with a checkout link.</li>
          <li>Track messages, clicks, and revenue from Instagram in one dashboard.</li>
        </ul>
      </section>

      <section className="srMarketingSection">
        <h2>See it in action</h2>
        <div className="srMarketingVideo">
          Add a 2–3 minute demo video here (embed or link to YouTube).
        </div>
      </section>

      <section className="srMarketingSection">
        <h2>Plans</h2>
        <div className="srMarketingPricing">
          <div className="srMarketingPricingCard">
            <strong>Free</strong>
            <span>25 messages/mo · DM automation · Basic analytics</span>
          </div>
          <div className="srMarketingPricingCard">
            <strong>Growth — $29/mo</strong>
            <span>100 messages · Comment-to-DM · Brand voice</span>
          </div>
          <div className="srMarketingPricingCard">
            <strong>Pro — $99/mo</strong>
            <span>Unlimited · Follow-ups · Revenue attribution</span>
          </div>
        </div>
      </section>

      <section className="srMarketingSection">
        <div className="srMarketingEmail">
          <h3>Get launch updates</h3>
          {emailSubmitted ? (
            <p className="srMarketingEmailSuccess">
              Thanks! We&apos;ll be in touch.
            </p>
          ) : (
            <form onSubmit={handleEmailSubmit}>
              <input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-label="Email for updates"
              />
              <button type="submit">Notify me</button>
            </form>
          )}
        </div>
      </section>

      <footer className="srMarketingFooter">
        <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
      </footer>
    </div>
  );
}

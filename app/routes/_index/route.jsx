import { redirect } from "react-router";
import { useState } from "react";

const SHOPIFY_APP_STORE_URL =
  typeof process !== "undefined" && process.env?.SHOPIFY_APP_STORE_URL
    ? process.env.SHOPIFY_APP_STORE_URL
    : "https://apps.shopify.com/";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SocialRepl.ai — DM Checkout AI",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://www.socialrepl.ai",
  description:
    "AI-powered Instagram DM and comment automation for Shopify stores. Automatically responds to customer messages with personalized, brand-voiced replies and one-click checkout links.",
  featureList: [
    "Instagram DM automation with AI-powered replies",
    "Comment-to-DM automation with checkout links",
    "AI message classification (purchase intent, product questions, price requests)",
    "Brand voice customization for every reply",
    "One-click Shopify checkout link generation",
    "Product-to-Instagram-post mapping",
    "Click and revenue attribution tracking",
    "Timed follow-up messages",
  ],
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "25 messages/mo, DM automation, basic analytics",
    },
    {
      "@type": "Offer",
      name: "Growth",
      price: "29",
      priceCurrency: "USD",
      billingIncrement: "P1M",
      description:
        "100 messages/mo, comment-to-DM automation, brand voice customization",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "99",
      priceCurrency: "USD",
      billingIncrement: "P1M",
      description:
        "Unlimited messages, follow-ups, revenue attribution, clarifying questions",
    },
  ],
  creator: {
    "@type": "Organization",
    name: "SocialRepl.ai",
    url: "https://www.socialrepl.ai",
  },
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const host = url.hostname;

  const shortDomain = (process.env.SHORT_LINK_DOMAIN || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (shortDomain && host === shortDomain) {
    return redirect("https://www.socialrepl.ai", 301);
  }

  if (url.searchParams.get("shop")) {
    if (url.searchParams.get("instagram_connected")) {
      const shop = url.searchParams.get("shop");
      throw redirect(`/app?connected=true&shop=${encodeURIComponent(shop || "")}`);
    }
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  if (host === "www.socialrepl.ai" || host === "socialrepl.ai") {
    return {};
  }

  return redirect("/app", 302);
};

export const meta = () => [
  { title: "SocialRepl.ai — Turn Instagram DMs into Shopify Sales" },
  {
    name: "description",
    content:
      "AI-powered Instagram DM and comment automation for Shopify stores. Sends personalized replies with one-click checkout links so you never miss a sale.",
  },
  { property: "og:title", content: "SocialRepl.ai — DM Checkout AI" },
  {
    property: "og:description",
    content:
      "Automatically respond to Instagram DMs and comments with AI-generated checkout links. Built for Shopify merchants.",
  },
  { property: "og:type", content: "website" },
  { property: "og:url", content: "https://www.socialrepl.ai" },
];

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
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

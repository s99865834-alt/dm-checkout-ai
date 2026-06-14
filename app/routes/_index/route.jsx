import { redirect, useLoaderData } from "react-router";
import { GoogleAnalytics } from "../../components/marketing/GoogleAnalytics";

const SHOPIFY_APP_STORE_URL =
  typeof process !== "undefined" && process.env?.SHOPIFY_APP_STORE_URL
    ? process.env.SHOPIFY_APP_STORE_URL
    : "https://apps.shopify.com/socialreplai";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SocialRepl.ai",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://www.socialrepl.ai",
  description:
    "SocialRepl.ai connects your Shopify store to Instagram so customer conversations become sales. AI replies to DMs and comments with personalized messages and one-click checkout links.",
  featureList: [
    "AI-powered Instagram DM automation with one-click checkout links",
    "Automatically reply to post comments with private DMs and product links",
    "AI brand voice that knows your products, policies, and FAQs",
    "Order attribution — track which Instagram conversations drive sales",
    "Multi-turn AI conversations that guide customers to checkout",
  ],
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "100 messages/mo · DM automation with AI · Checkout links · Basic analytics",
    },
    {
      "@type": "Offer",
      name: "Growth",
      price: "39",
      priceCurrency: "USD",
      billingIncrement: "P1M",
      description:
        "500 messages/mo · DMs + Comment-to-DM · Brand voice customization · Order attribution + full analytics",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "99",
      priceCurrency: "USD",
      billingIncrement: "P1M",
      description:
        "30-day free trial · 10,000 messages/mo · Follow-up messages · Multi-turn conversations · Per-post analytics · Priority support",
    },
  ],
  creator: {
    "@type": "Organization",
    name: "Tennyson Labs",
    url: "https://www.socialrepl.ai",
  },
  sameAs: [SHOPIFY_APP_STORE_URL],
};

// Single source of truth for the FAQ section and its FAQPage JSON-LD.
// Problem-phrased questions first — they match what merchants actually
// ask search engines and AI assistants.
const FAQS = [
  {
    q: "How do I automatically reply to Instagram DMs on Shopify?",
    a: "Install SocialReplAI from the Shopify App Store, connect your Instagram Business account, and turn on DM automation. The AI reads each incoming DM, detects what the customer is asking — price, sizing, availability, purchase intent — and replies instantly in your brand voice with a Shopify checkout link when the customer is ready to buy.",
  },
  {
    q: "Can I send checkout links in Instagram DMs?",
    a: "Yes. SocialReplAI generates a Shopify checkout URL with the right product and variant pre-loaded and includes it in the automated reply, so customers can buy in one tap. Every link is uniquely tracked for attribution.",
  },
  {
    q: "How do I track sales from Instagram comments and DMs?",
    a: "Every checkout link SocialReplAI sends is uniquely tracked. When a customer buys, the order is attributed back to the originating DM or comment, and the analytics dashboard shows clicks, orders, and revenue split by source.",
  },
  {
    q: "How do I turn Instagram comments into sales?",
    a: "With comment-to-DM automation: when someone comments on one of your posts, SocialReplAI automatically sends them a private DM with an AI-written message and a checkout link for the product featured in that post — links in public comments aren't clickable, but DM links are.",
  },
  {
    q: "What does SocialRepl.ai actually do?",
    a: "It connects your Shopify store to Instagram and uses AI to reply to DMs and comments with personalized messages and one-click checkout links. The AI learns your products, pricing, and store policies so replies sound like you.",
  },
  {
    q: "Do I need an Instagram Business account?",
    a: "Yes. You'll need an Instagram Business or Creator account linked to a Facebook Page to authorize messaging. We walk you through it during onboarding.",
  },
  {
    q: "How does the AI know which product to recommend?",
    a: "You can map products to specific Instagram posts, and the AI also detects product mentions from the conversation. When intent is clear, it generates a short checkout link for that product.",
  },
  {
    q: "Can I customize the brand voice?",
    a: "Yes. Pick from preset tones (Casual, Professional, Friendly, etc.) and add custom voice instructions — for example, \"always use emojis\" or \"don't discount.\" The AI sticks to your style.",
  },
  {
    q: "What happens if I hit my message limit?",
    a: "Automation pauses for the rest of the billing cycle, and you can upgrade anytime from inside the app to keep replying.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const host = url.hostname;

  // The short-link domain (srai.link) exists only to serve /{linkId}
  // redirects. If anyone lands on its root or any non-link path, bounce them
  // to the marketing site. The default mirrors buildCheckoutLink's shortener
  // base so this keeps working even when SHORT_LINK_DOMAIN isn't set in the
  // server environment (which is what previously dumped srai.link visitors
  // onto the embedded app's /auth/login install page). Both the www host and
  // the bare apex are matched.
  const shortDomain = (process.env.SHORT_LINK_DOMAIN || "https://www.srai.link")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const shortApex = shortDomain.replace(/^www\./, "");
  if (shortDomain && (host === shortDomain || host === shortApex)) {
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
    return { gaId: process.env.GA_MEASUREMENT_ID || "G-BDGNW3KHQD" };
  }

  return redirect("/app", 302);
};

export const meta = () => [
  { title: "SocialRepl.ai — Turn Instagram DMs & comments into Shopify sales" },
  {
    name: "description",
    content:
      "AI replies to your Instagram DMs and comments with one-click Shopify checkout links — so you sell more while you sleep. Built for Shopify merchants.",
  },
  { property: "og:title", content: "SocialRepl.ai — Instagram automation for Shopify" },
  {
    property: "og:description",
    content:
      "Automate Instagram DM and comment replies with AI-powered checkout links. Built for Shopify.",
  },
  { tagName: "link", rel: "canonical", href: "https://www.socialrepl.ai/" },
  { property: "og:type", content: "website" },
  { property: "og:url", content: "https://www.socialrepl.ai" },
  { property: "og:image", content: "https://www.socialrepl.ai/landing/hero.png" },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:image", content: "https://www.socialrepl.ai/landing/hero.png" },
];

function Logo({ className = "" }) {
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

export default function LandingPage() {
  const { gaId } = useLoaderData() || {};
  return (
    <div className="srMarketingLanding">
      <GoogleAnalytics gaId={gaId} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

      <header className="srNav">
        <div className="srNavInner">
          <a href="/" className="srNavBrand" aria-label="SocialRepl.ai home">
            <Logo />
          </a>
          <nav className="srNavLinks" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
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

      <section className="srHero">
        <div className="srHeroBg" aria-hidden="true" />
        <div className="srHeroInner">
          <div className="srHeroCopy">
            <span className="srEyebrow">Built for Shopify · Works with Instagram</span>
            <h1>
              Transform Instagram DMs &amp; comments{" "}
              <span className="srHeroHighlight">into sales.</span>
            </h1>
            <p className="srHeroLede">
              SocialRepl.ai connects your Shopify store to Instagram so customer
              conversations become orders. When someone DMs or comments about a
              product, the app replies instantly with a personalized AI message
              and a direct checkout link.
            </p>
            <div className="srHeroActions">
              <a
                className="srBtnPrimary"
                href={SHOPIFY_APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Install from Shopify App Store
              </a>
              <a className="srBtnGhost" href="#how-it-works">
                See how it works
              </a>
            </div>
            <p className="srHeroFinePrint">
              Free plan available · 100 messages/mo · No credit card required
            </p>
          </div>
          <div className="srHeroArt" aria-hidden="true">
            <img
              src="/landing/hero.png"
              alt="SocialRepl.ai turning an Instagram DM into a Shopify checkout link"
              loading="eager"
              width="1024"
              height="576"
            />
          </div>
        </div>
      </section>

      <section className="srTrust" aria-label="Integrations">
        <div className="srTrustInner">
          <span className="srTrustLabel">Works with</span>
          <span className="srTrustPill">Shopify</span>
          <span className="srTrustPill">Instagram</span>
          <span className="srTrustPill">OpenAI</span>
        </div>
      </section>

      <section id="features" className="srFeatures">
        <div className="srFeatureRow">
          <div className="srFeatureCopy">
            <span className="srFeatureKicker">Connect</span>
            <h2>One-click Instagram setup.</h2>
            <p>
              Link your Instagram Business account to your Shopify store in
              seconds. Toggle DM automation, comment automation, and follow-up
              messages on or off, and dial in your brand voice.
            </p>
            <ul className="srFeatureList">
              <li>Plug-and-play OAuth — no copy-pasting tokens.</li>
              <li>Per-channel toggles for DMs, comments, and follow-ups.</li>
              <li>Tone presets plus a free-form custom voice field.</li>
            </ul>
          </div>
          <div className="srFeatureArt">
            <img
              src="/landing/feature-connect.png"
              alt="Instagram connect screen with plan usage, automation toggles, and tone settings"
              loading="lazy"
              width="1024"
              height="576"
            />
          </div>
        </div>

        <div className="srFeatureRow srFeatureRowReverse">
          <div className="srFeatureCopy">
            <span className="srFeatureKicker">Map</span>
            <h2>Map products to your Instagram posts.</h2>
            <p>
              Tell the AI which product is featured in each post and it will
              recommend the right item and generate a checkout link the moment
              a customer asks about it.
            </p>
            <ul className="srFeatureList">
              <li>Pick a product per post from your Shopify catalog.</li>
              <li>Enable or disable automation per post.</li>
              <li>Unmapped posts fall back to smart product detection.</li>
            </ul>
          </div>
          <div className="srFeatureArt">
            <img
              src="/landing/feature-map.png"
              alt="Mapping Shopify products to Instagram posts with per-post automation toggles"
              loading="lazy"
              width="1024"
              height="576"
            />
          </div>
        </div>

        <div className="srFeatureRow">
          <div className="srFeatureCopy">
            <span className="srFeatureKicker">Reply</span>
            <h2>AI replies with one-click checkout links.</h2>
            <p>
              When a customer comments or sends a DM, SocialRepl.ai answers in
              your brand voice and drops in a short, trackable checkout link
              that goes straight to the right product.
            </p>
            <ul className="srFeatureList">
              <li>Multi-turn conversations that handle follow-up questions.</li>
              <li>Knows your products, pricing, and store policies.</li>
              <li>Comment-to-DM flow keeps the conversation private.</li>
            </ul>
          </div>
          <div className="srFeatureArt">
            <img
              src="/landing/feature-reply.png"
              alt="AI replying to an Instagram comment with a personalized DM and checkout link"
              loading="lazy"
              width="1024"
              height="576"
            />
          </div>
        </div>

        <div className="srFeatureRow srFeatureRowReverse">
          <div className="srFeatureCopy">
            <span className="srFeatureKicker">Track</span>
            <h2>Track messages, clicks, and revenue.</h2>
            <p>
              See exactly how Instagram is driving sales. SocialRepl.ai
              attributes orders back to the DMs and comments that started them,
              so you know what's working.
            </p>
            <ul className="srFeatureList">
              <li>Messages, links sent, clicks, click-through rate.</li>
              <li>Sentiment analysis and customer segmentation.</li>
              <li>Revenue attribution split by DM vs. comment.</li>
            </ul>
          </div>
          <div className="srFeatureArt">
            <img
              src="/landing/feature-track.png"
              alt="Analytics dashboard showing messages, clicks, and revenue attributed to Instagram"
              loading="lazy"
              width="1024"
              height="576"
            />
          </div>
        </div>
      </section>

      <section id="how-it-works" className="srHowItWorks">
        <div className="srSectionHead">
          <span className="srEyebrow">How it works</span>
          <h2>From DM to checkout in minutes.</h2>
        </div>
        <ol className="srSteps">
          <li>
            <span className="srStepNum">1</span>
            <h3>Install &amp; connect</h3>
            <p>Install from the Shopify App Store and link your Instagram Business account.</p>
          </li>
          <li>
            <span className="srStepNum">2</span>
            <h3>Map your posts</h3>
            <p>Match Instagram posts to the products they're selling — or let the AI do it for you.</p>
          </li>
          <li>
            <span className="srStepNum">3</span>
            <h3>Turn on automation</h3>
            <p>Pick a tone, add custom voice notes, and flip on DMs, comments, and follow-ups.</p>
          </li>
          <li>
            <span className="srStepNum">4</span>
            <h3>Watch the orders roll in</h3>
            <p>The AI replies 24/7 with checkout links. You watch revenue land in your dashboard.</p>
          </li>
        </ol>
      </section>

      <section id="pricing" className="srPricing">
        <div className="srSectionHead">
          <span className="srEyebrow">Pricing</span>
          <h2>Start free. Scale when you're ready.</h2>
          <p className="srSectionSub">
            All plans include AI replies and Shopify checkout links. Billed in USD every 30 days.
          </p>
        </div>
        <div className="srPlanGrid3">
          <div className="srPlanCard">
            <div className="srPlanName">Free</div>
            <div className="srPlanPrice">
              <span className="srPlanAmount">$0</span>
              <span className="srPlanPer">/month</span>
            </div>
            <ul className="srPlanFeatures">
              <li>100 messages / month</li>
              <li>DM automation with AI</li>
              <li>Checkout links</li>
              <li>Basic analytics</li>
            </ul>
            <a
              className="srBtnSecondary"
              href={SHOPIFY_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get started free
            </a>
          </div>

          <div className="srPlanCard srPlanCardFeatured">
            <div className="srPlanBadge">Most popular</div>
            <div className="srPlanName">Growth</div>
            <div className="srPlanPrice">
              <span className="srPlanAmount">$39</span>
              <span className="srPlanPer">/month</span>
            </div>
            <ul className="srPlanFeatures">
              <li>500 messages / month</li>
              <li>DMs + Comment-to-DM</li>
              <li>Brand voice customization</li>
              <li>Store question answering</li>
              <li>Order attribution + full analytics</li>
            </ul>
            <a
              className="srBtnPrimary"
              href={SHOPIFY_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Start Growth
            </a>
          </div>

          <div className="srPlanCard">
            <div className="srPlanName">Pro</div>
            <div className="srPlanPrice">
              <span className="srPlanAmount">$99</span>
              <span className="srPlanPer">/month</span>
            </div>
            <div className="srPlanTrial">30-day free trial</div>
            <ul className="srPlanFeatures">
              <li>10,000 messages / month</li>
              <li>Everything in Growth</li>
              <li>Follow-up messages</li>
              <li>Multi-turn conversations</li>
              <li>Per-post analytics</li>
              <li>Priority support</li>
            </ul>
            <a
              className="srBtnSecondary"
              href={SHOPIFY_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Start free Pro trial
            </a>
          </div>
        </div>
      </section>

      <section id="faq" className="srFaq">
        <div className="srSectionHead">
          <span className="srEyebrow">FAQ</span>
          <h2>Frequently asked questions</h2>
        </div>
        <div className="srFaqList">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="srFaqCard">
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="srCta">
        <div className="srCtaInner">
          <h2>Ready to turn Instagram into your best sales channel?</h2>
          <p>Install free, connect Instagram, and start replying to DMs and comments today.</p>
          <a
            className="srBtnPrimary srBtnLarge"
            href={SHOPIFY_APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Install from Shopify App Store
          </a>
        </div>
      </section>

      <footer className="srFooter">
        <div className="srFooterInner">
          <div className="srFooterBrand">
            <Logo />
            <p className="srFooterTag">AI Instagram replies with checkout links for Shopify.</p>
          </div>
          <div className="srFooterLinks">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="/blog">Blog</a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a
              href={SHOPIFY_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Shopify App Store
            </a>
          </div>
        </div>
        <div className="srFooterMeta">
          © {new Date().getFullYear()} Tennyson Labs · Made for Shopify merchants
        </div>
      </footer>
    </div>
  );
}

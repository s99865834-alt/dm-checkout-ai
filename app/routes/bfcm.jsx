import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import { MarketingNav, MarketingFooter, appStoreUrl } from "../components/marketing/MarketingChrome";
import { GoogleAnalytics } from "../components/marketing/GoogleAnalytics";

// Spots still open on the BFCM offer. Lower this when a shop is granted Pro.
const SPOTS_LEFT = 44;
const SPOTS_TOTAL = 100;
// Nov 18, 2026, 11:59pm Denver time. Setup has to be done before Black Friday.
const DEADLINE_MS = Date.parse("2026-11-19T06:59:00.000Z");

const INSTALL_URL = appStoreUrl("bfcm_pro");

export const loader = () => {
  return { gaId: process.env.GA_MEASUREMENT_ID || "G-BDGNW3KHQD" };
};

export const meta = () => [
  { title: "Free Pro for Black Friday | SocialRepl.ai" },
  {
    name: "description",
    content:
      "First 100 Shopify shops. Answer Instagram DMs and comments automatically with 2 months of Pro, free. Set up before November 18.",
  },
  { name: "robots", content: "noindex" },
];

function timeLeft(now) {
  const diff = Math.max(0, DEADLINE_MS - now);
  const totalSeconds = Math.floor(diff / 1000);
  return {
    closed: diff === 0,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export default function BfcmSplash() {
  const { gaId } = useLoaderData() || {};
  const [left, setLeft] = useState(() => timeLeft(Date.now()));

  useEffect(() => {
    const id = setInterval(() => setLeft(timeLeft(Date.now())), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="srMarketingLanding srBfcm">
      <GoogleAnalytics gaId={gaId} />
      <MarketingNav />
      <div className="srBfcmBar">
        <div className="srBfcmBarInner">
          <strong>{SPOTS_LEFT} of {SPOTS_TOTAL} spots left</strong>
          <span>
            {left.closed
              ? "Setup window closed"
              : `List closes in ${left.days}d ${left.hours}h ${left.minutes}m ${left.seconds}s`}
          </span>
        </div>
      </div>

      <main>
        <section className="srHero">
          <div className="srHeroInner">
            <div className="srHeroCopy">
              <span className="srEyebrow">Black Friday. First 100 shops.</span>
              <h1>
                Answer your DMs and comments automatically.{" "}
                <span className="srHeroHighlight">Free for BFCM.</span>
              </h1>
              <p className="srHeroLede">
                The comment flood is coming. While you pack orders, shoppers
                will ask how much, what size, and where the link is. The first
                100 Shopify shops get 2 months of Pro, free, so those questions
                get a checkout link instead of sitting there overnight.
              </p>
              <div className="srBfcmStats">
                <div>
                  <strong>{SPOTS_LEFT}</strong>
                  <span>spots left</span>
                </div>
                <div>
                  <strong>2 months</strong>
                  <span>of Pro, free</span>
                </div>
                <div>
                  <strong>Nov 18</strong>
                  <span>last day to set up</span>
                </div>
              </div>
              <Countdown left={left} />
              <div className="srHeroActions">
                <a className="srBtnPrimary srBtnLarge" href={INSTALL_URL} target="_blank" rel="noopener noreferrer">
                  Claim free Pro
                </a>
              </div>
              <p className="srHeroFinePrint">
                Install, then email support@socialrepl.ai with your store URL.
                Pro is turned on the same day.
              </p>
            </div>
            <div className="srHeroArt">
              <img
                src="/landing/hero.png"
                alt="SocialRepl.ai turning an Instagram DM into a Shopify checkout link"
                width="1024"
                height="576"
              />
            </div>
          </div>
        </section>

        <section className="srBfcmPain">
          <div className="srBfcmWrap">
            <h2>Every missed “how much?” is a sale your competitor answers.</h2>
            <p>
              Black Friday does not wait for you to get off the packing table.
              The shops that reply in seconds get the order. The shops that
              reply tomorrow get a story about how busy they were.
            </p>
          </div>
        </section>

        <section className="srFeatures">
          <div className="srBfcmWrap">
            <span className="srEyebrow">What the 2 free months include</span>
            <h2>Pro, turned on before the rush.</h2>
            <ul className="srFeatureList">
              <li>Comment-to-DM: public comments become private checkout links.</li>
              <li>AI replies to Instagram DMs with the right product pre-loaded.</li>
              <li>Answers from your live catalog, pricing, and policies.</li>
              <li>Replies in your brand voice. No flows to build.</li>
              <li>It steps aside for 6 hours when you reply yourself.</li>
              <li>10,000 messages a month, so a drop does not shut it off.</li>
              <li>Order attribution: see the revenue the conversation drove.</li>
            </ul>
            <a className="srBtnPrimary" href={INSTALL_URL} target="_blank" rel="noopener noreferrer">
              Claim one of {SPOTS_LEFT} spots
            </a>
          </div>
        </section>

        <section className="srHow">
          <div className="srBfcmWrap">
            <h2>Be live before November 18.</h2>
            <ol className="srBfcmSteps">
              <li>
                <strong>Install</strong>
                <span>Add SocialRepl.ai from the Shopify App Store. It takes a few minutes.</span>
              </li>
              <li>
                <strong>Email your store URL</strong>
                <span>Send it to support@socialrepl.ai. Pro is turned on the same day.</span>
              </li>
              <li>
                <strong>Connect Instagram</strong>
                <span>Turn on comments. Map the products in your Black Friday posts.</span>
              </li>
            </ol>
          </div>
        </section>

        <section className="srCta">
          <div className="srCtaInner">
            <h2>Do not go into Black Friday still typing replies by hand.</h2>
            <p>
              {SPOTS_LEFT} spots. 2 months of Pro, free. The list closes November 18.
            </p>
            <a className="srBtnPrimary srBtnLarge" href={INSTALL_URL} target="_blank" rel="noopener noreferrer">
              Claim free Pro
            </a>
            <p className="srBfcmFine">
              The Shopify listing shows the normal prices. This page is the offer.
              After 2 months, Pro is $99 a month and you can cancel. No charge during the free months.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function Countdown({ left }) {
  if (left.closed) {
    return <p className="srBfcmClosed">The November 18 setup list is closed.</p>;
  }
  const units = [
    ["Days", left.days],
    ["Hours", left.hours],
    ["Min", left.minutes],
    ["Sec", left.seconds],
  ];
  return (
    <div className="srBfcmClock" aria-label="Time left to set up">
      {units.map(([label, value]) => (
        <div key={label}>
          <strong>{String(value).padStart(2, "0")}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

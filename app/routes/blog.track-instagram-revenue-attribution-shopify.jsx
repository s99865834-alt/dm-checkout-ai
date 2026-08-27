import { getPost } from "../lib/blog-posts";
import { Article, articleMeta } from "../components/marketing/Article";
import { appStoreUrl } from "../components/marketing/MarketingChrome";

const post = getPost("track-instagram-revenue-attribution-shopify");

export const meta = () => articleMeta(post);

const FAQS = [
  {
    q: "How do you track which Instagram DM led to a sale?",
    a: "By sending a uniquely tracked checkout link in every automated reply, then matching that link to the resulting Shopify order. SocialReplAI generates a distinct short link per conversation, records when it's clicked, and reads it back off the order when the customer completes checkout — so every attributed sale is tied to the exact DM or comment that started it.",
  },
  {
    q: "Can Shopify track social media attribution natively?",
    a: "Shopify's own analytics can show broad traffic-source data if a customer arrives through a tracked link, but it doesn't know which specific DM conversation or comment drove a sale — that level of detail requires the app sending the link to record and match it. Native analytics tells you \"some traffic came from Instagram\"; conversation-level attribution tells you \"this exact DM became this exact order.\"",
  },
  {
    q: "What's the difference between clicks and attributed revenue?",
    a: "A click means someone tapped the checkout link — interest, not necessarily a sale. Attributed revenue means the click led all the way to a completed Shopify order. Watching both numbers matters: high clicks with low attributed revenue usually points to a problem after the click (price, shipping cost, checkout friction), not a problem with the automated reply itself.",
  },
  {
    q: "Do I need Growth or Pro to see attribution?",
    a: "Full order attribution and analytics are on the Growth and Pro plans. The Free plan includes basic analytics — messages sent, click-through rate, and top trigger phrases — so you can see engagement before deciding whether to upgrade for the revenue-level view.",
  },
];

export default function TrackInstagramRevenueAttribution() {
  return (
    <Article post={post} faqs={FAQS}>
      <h2>Why "engagement" isn't the same as revenue</h2>
      <p>
        Messages sent, replies handled, comments answered — these numbers tell you
        automation is running, but they don't tell you whether it's making money. A store
        can have thousands of Instagram interactions a month and have no idea if any of
        them turned into an order. Attribution is the piece that closes that gap: it
        connects a specific conversation to a specific sale, so instead of "Instagram is
        active," you can say "Instagram brought in $X this month, and here's exactly which
        conversations drove it."
      </p>

      <h2>How checkout-link attribution actually works</h2>
      <p>
        The mechanism is simpler than it sounds. Every time an automated reply includes a
        checkout link, that link is unique to the conversation it was sent in — not a
        generic link to your homepage or product page. When the customer taps it, the
        click is recorded. If they complete the Shopify checkout, the order is matched
        back to that same link, and the sale is attributed to the DM or comment that
        generated it. No manual tagging or guesswork: the link itself carries the
        connection from first message to completed order.
      </p>

      <h2>What to actually track</h2>
      <p>
        Four numbers matter, in order. <strong>Messages and links sent</strong> — how much
        volume automation is handling. <strong>Click-through rate</strong> — what share of
        checkout links actually get tapped, a signal of whether replies are relevant and
        well-timed. <strong>Attributed orders and revenue</strong> — the number that
        answers "is this making money." And <strong>revenue by source</strong>, split
        between DM-initiated and comment-initiated conversations, which tells you where to
        put more attention — mapping more posts to products, or tightening up DM reply
        quality.
      </p>

      <h2>Reading clicks vs. revenue together</h2>
      <p>
        These two numbers diagnose different problems. High click-through with little
        attributed revenue usually means the reply is working — people are interested
        enough to tap — but something after the click is losing them: price surprise,
        shipping cost, a slow checkout, or the wrong variant loaded. Low click-through
        means the reply itself isn't landing — check whether the AI is recommending the
        right product, and whether your brand voice settings match how your audience
        actually talks. Attribution turns "sales feel slow" into a specific, fixable
        problem instead of a guess.
      </p>

      <h2>Using the numbers to decide what to do next</h2>
      <p>
        Once you can see attributed revenue, it becomes the input for real decisions
        instead of instinct. Compare revenue by source to figure out whether comment-to-DM
        or direct DMs deserve more of your attention. Compare attributed revenue to your
        plan's cost to see the actual return, not a guess. And if you're mapping products
        to Instagram posts, per-post analytics show which posts are converting so you can
        make more content like it — and stop spending mapping effort on posts that aren't
        driving orders.
      </p>

      <h2>Getting started</h2>
      <p>
        Install{" "}
        <a
          href={appStoreUrl("blog_attribution_guide")}
          target="_blank"
          rel="noopener noreferrer"
        >
          SocialReplAI
        </a>{" "}
        and every checkout link it sends is tracked automatically — there's no separate
        setup for attribution itself. For the full picture of what automation covers
        before you get to the numbers, see our{" "}
        <a href="/blog/instagram-dm-automation-for-shopify-guide">
          complete Instagram DM automation guide
        </a>{" "}
        and{" "}
        <a href="/blog/turn-instagram-comments-into-sales">
          comment-to-DM walkthrough
        </a>
        .
      </p>
    </Article>
  );
}

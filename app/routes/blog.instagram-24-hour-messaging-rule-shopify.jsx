import { getPost } from "../lib/blog-posts";
import { Article, articleMeta } from "../components/marketing/Article";
import { appStoreUrl } from "../components/marketing/MarketingChrome";

const post = getPost("instagram-24-hour-messaging-rule-shopify");

export const meta = () => articleMeta(post);

const FAQS = [
  {
    q: "What is Instagram's 24-hour messaging rule?",
    a: "It's Meta's standard messaging window: once a customer sends you a DM, you can reply with free-form messages for 24 hours from their last message. After that window closes, standard messages can't be sent until the customer messages you again — you can't restart a promotional conversation on your own.",
  },
  {
    q: "Can I message a customer on Instagram after 24 hours?",
    a: "Not with a standard free-form message. The window resets each time the customer messages you, so if they reply — even just \"thanks!\" — you get another 24 hours. Outside the window, repeatedly trying to reach someone who hasn't responded is the kind of unsolicited outreach that risks restrictions on your account.",
  },
  {
    q: "Does automation help with the 24-hour window?",
    a: "Yes — the biggest risk to the window is a slow human reply. If a customer DMs you at 11pm and you reply the next afternoon, you've already used up a big chunk of the 24 hours before the conversation even starts. AI automation replies in seconds, so the full window is available for back-and-forth, follow-up questions, and a checkout link.",
  },
  {
    q: "Will follow-up messages violate Instagram's policy?",
    a: "Not if they're sent inside the 24-hour window to a customer who already messaged you. A follow-up like \"still there? here's your link\" sent a few hours after someone clicked but didn't buy is a normal continuation of an existing conversation. What crosses the line is messaging someone who never contacted you, or messaging them again well after the window closed with no new message from them.",
  },
];

export default function TwentyFourHourRule() {
  return (
    <Article post={post} faqs={FAQS}>
      <h2>What the 24-hour messaging rule actually is</h2>
      <p>
        Meta applies a standard messaging window to Instagram Direct, the same as it does
        to Facebook Messenger: once a customer sends your business a DM, you can reply
        with free-form messages for 24 hours, counted from the last message they sent you.
        Every new message from the customer resets the clock. Once 24 hours pass with no
        reply from them, the window closes, and you can't send another standard promotional
        or informational message until they message you again.
      </p>

      <h2>Why this matters more for Shopify sellers than it sounds like it should</h2>
      <p>
        On the surface this looks like a messaging technicality. In practice, it's a hard
        deadline on every sale sitting in your DMs. Someone comments "how much?" or DMs
        asking about sizing — that's a live window of buying intent, and the entire window
        is available to answer questions, send a checkout link, and follow up if they
        don't complete the purchase. Every hour you don't reply is an hour of that window
        gone, and if it closes before you've sent anything useful, you generally can't
        reopen the conversation yourself.
      </p>

      <h2>What happens if you miss the window</h2>
      <p>
        If nobody replies within 24 hours, the thread doesn't disappear, but you lose the
        ability to send free-form messages into it. The customer would need to message
        you again to reopen it. For a store relying on manual replies, this is exactly how
        DM sales quietly evaporate: the question gets answered a day later, the window has
        already closed on any follow-up, and there's no way to nudge an interested
        customer who went quiet.
      </p>

      <h2>How automation keeps you inside the window every time</h2>
      <p>
        The fix is structural, not a discipline problem: reply within seconds instead of
        hours, so the full 24-hour window is available for the conversation to actually
        happen. With{" "}
        <a
          href={appStoreUrl("blog_24hr_rule_guide")}
          target="_blank"
          rel="noopener noreferrer"
        >
          SocialReplAI
        </a>
        , every DM and comment-triggered message gets an instant AI reply in your brand
        voice, so a customer asking about a product gets an answer — and a checkout link —
        before the window has lost any meaningful time. On plans with follow-up messages,
        a single well-timed nudge to someone who clicked but didn't finish checkout goes
        out while the window is still open, which is the only time it's allowed to.
      </p>

      <h2>Staying inside the lines: what not to do</h2>
      <p>
        The rule exists to stop businesses from using DMs as an unsolicited broadcast
        channel, so the boundaries are straightforward. Don't message people who never
        contacted you. Don't try to restart a conversation with someone who went quiet
        more than 24 hours ago — wait for them to message again. And don't send repeated
        follow-ups hoping one lands; one relevant, well-timed message inside the window
        beats several outside it, both for policy compliance and for how it reads to the
        customer.
      </p>

      <h2>Getting started</h2>
      <p>
        The practical takeaway is simple: the businesses that win Instagram DM sales are
        the ones that never let the clock run out in the first place. Our{" "}
        <a href="/blog/how-to-automatically-reply-to-instagram-dms-shopify">
          step-by-step DM automation guide
        </a>{" "}
        and{" "}
        <a href="/blog/instagram-dm-automation-for-shopify-guide">
          complete Instagram DM automation guide
        </a>{" "}
        cover setup in full.
      </p>
    </Article>
  );
}

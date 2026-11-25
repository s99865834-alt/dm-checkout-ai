import { TRIAL_DAYS } from "../lib/plans";

/** An illustration of a reply, using the store's own product when it has one. */
function ReplyExample({ example }) {
  let question;
  let answer;
  if (example?.price) {
    question = `How much is the ${example.title}?`;
    answer = `The ${example.title} ${example.from ? "starts at" : "is"} ${example.price}. Here's a checkout link with it already in your cart:`;
  } else if (example) {
    question = `Do you have the ${example.title}?`;
    answer = `Yes! Here's a checkout link with the ${example.title} already in your cart:`;
  } else {
    question = "How much is the linen dress?";
    answer = "It's $48 and comes in S, M and L. Which size would you like? I'll send a checkout link with it in your cart.";
  }
  return (
    <div className="srPlanExample" aria-label="Example Instagram reply">
      <span className="srPlanExampleLabel">
        {example ? "What a reply looks like for your store" : "What a reply looks like"}
      </span>
      <div className="srDmBubble srDmCustomer">{question}</div>
      <div className="srDmBubble srDmStore">
        {answer}
        {example && <span className="srDmLink">{`${example.domain}/a/go/…`}</span>}
      </div>
    </div>
  );
}

/**
 * Shown to a store choosing its first plan: what the trial costs and what
 * happens after. `firstChargeOn` is only set when the full trial is certain;
 * without it the copy defers to what Shopify shows.
 */
export function PlanIntro({ firstChargeOn, example }) {
  const title = firstChargeOn ? `Try it free for ${TRIAL_DAYS} days` : `${TRIAL_DAYS} days free for new stores`;
  const terms = firstChargeOn
    ? `You pay $0 today. Your first charge would be on ${firstChargeOn}, and if you cancel before then you pay nothing. Shopify confirms the date before you approve.`
    : "Shopify shows your exact trial and first charge date before you approve anything.";
  return (
    <div className="srPlanIntro">
      <div className="srPlanIntroText">
        <span className="srPlanIntroTitle">{title}</span>
        <span className="srCardDesc">{terms}</span>
        <span className="srCardTitle">What happens next</span>
        <ol className="srPlanSteps">
          <li>
            <strong>Approve on Shopify.</strong> Billing goes through Shopify, and you can cancel anytime from your
            Shopify admin.
          </li>
          <li>
            <strong>Connect Instagram.</strong> Log in with your business account. It takes about 2 minutes.
          </li>
          <li>
            <strong>The AI starts answering.</strong> Customers get answers about your products with a checkout
            link. Pause it anytime from Home.
          </li>
        </ol>
      </div>
      <ReplyExample example={example} />
    </div>
  );
}

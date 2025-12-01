import { useOutletContext, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);
  return { shop, plan };
};

export default function InstagramPage() {
  const { shop, plan } = useOutletContext() || {};
  const { hasAccess, isFree, isGrowth, isPro } = usePlanAccess();

  return (
    <s-page heading="Instagram Feed">
      {shop && plan && (
        <s-section>
          <s-stack direction="inline" gap="base">
            <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
              {plan.name} Plan
            </s-badge>
          </s-stack>
        </s-section>
      )}

      {/* DM Automation - Available to all plans */}
      <s-section heading="DM Automation">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Automatically respond to Instagram DMs with AI-powered product recommendations and checkout links.
          </s-paragraph>
          <s-paragraph>
            <s-text variant="subdued">
              Status: {plan?.dm ? "Enabled" : "Disabled"}
            </s-text>
          </s-paragraph>
        </s-stack>
      </s-section>

      {/* Comments Automation - Growth+ */}
      <PlanGate requiredPlan="GROWTH" feature="Comments Automation">
        <s-section heading="Comments Automation">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Automatically respond to Instagram comments with private DMs containing product recommendations and checkout links.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.comments ? "Enabled" : "Disabled"}
              </s-text>
            </s-paragraph>
            <s-button>Configure Comments</s-button>
          </s-stack>
        </s-section>
      </PlanGate>

      {/* Conversations - Growth+ */}
      <PlanGate requiredPlan="GROWTH" feature="Conversational AI">
        <s-section heading="Conversational AI">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Engage in multi-message conversations with customers, answering questions and providing personalized recommendations.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.converse ? "Enabled" : "Disabled"}
              </s-text>
            </s-paragraph>
            <s-button>Configure Conversations</s-button>
          </s-stack>
        </s-section>
      </PlanGate>

      {/* Brand Voice - Growth+ */}
      <PlanGate requiredPlan="GROWTH" feature="Brand Voice">
        <s-section heading="Brand Voice Customization">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Customize the tone and style of AI responses to match your brand personality.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.brandVoice ? "Available" : "Not Available"}
              </s-text>
            </s-paragraph>
            <s-button>Configure Brand Voice</s-button>
          </s-stack>
        </s-section>
      </PlanGate>

      {/* Follow-ups - Pro only */}
      <PlanGate requiredPlan="PRO" feature="Follow-up Automation">
        <s-section heading="Follow-up Automation">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Automatically send follow-up messages to customers who haven't converted within 23 hours.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.followup ? "Enabled" : "Disabled"}
              </s-text>
            </s-paragraph>
            <s-button>Configure Follow-ups</s-button>
          </s-stack>
        </s-section>
      </PlanGate>

      {/* Remarketing - Pro only */}
      <PlanGate requiredPlan="PRO" feature="Remarketing">
        <s-section heading="Remarketing">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Engage users who haven't converted with follow-ups and email capture for remarketing campaigns.
            </s-paragraph>
            <s-paragraph>
              <s-text variant="subdued">
                Status: {plan?.remarketing ? "Enabled" : "Disabled"}
              </s-text>
            </s-paragraph>
            <s-button>Setup Remarketing</s-button>
          </s-stack>
        </s-section>
      </PlanGate>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
  
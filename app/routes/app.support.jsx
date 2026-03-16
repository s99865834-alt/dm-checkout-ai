import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function SupportPage() {
    return (
      <s-page heading="Support">
        <s-section heading="We're Here to Help">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              We're committed to providing you with the best experience using SocialRepl.ai. Whether you have a question about features, need help with setup, or want to share feedback — we're here for you.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Get in Touch">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              If you have any questions or need support, please reach out:
            </s-paragraph>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-link href="mailto:support@socialrepl.ai" variant="primary">
                support@socialrepl.ai
              </s-link>
            </s-box>
            <s-paragraph tone="subdued">
              We typically respond within 24 hours during business days. For urgent matters, please mark your email as urgent and we'll prioritize your request.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Common Questions">
          <s-stack direction="block" gap="tight">
            <details className="srFaqItem">
              <summary className="srFaqSummary">How do I connect my Instagram account?</summary>
              <p className="srFaqAnswer">Go to the Home page and click "Connect Instagram" in the Plan & Instagram section. You'll be guided through the Meta authorization process.</p>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">How do I map products to posts?</summary>
              <p className="srFaqAnswer">On the Home page, scroll to "Your Instagram Posts." Select a post, choose a Shopify product and variant, then click "Save mapping." The AI will use this to send the right checkout links.</p>
            </details>
            <details className="srFaqItem">
              <summary className="srFaqSummary">How do I change my plan?</summary>
              <p className="srFaqAnswer">Go to the Billing page to upgrade or manage your subscription. Upgrades take effect immediately. To cancel, use the "Billing settings" link on the Billing page.</p>
            </details>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

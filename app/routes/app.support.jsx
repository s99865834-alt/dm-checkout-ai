import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function SupportPage() {
    return (
      <s-page heading="Support">
        <s-section heading="We're Here to Help">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              At SocialRepl.ai, we deeply value our customers and are committed to providing you with the best possible experience. We understand that running a business can be challenging, and we're here to support you every step of the way.
            </s-paragraph>
            <s-paragraph>
              Whether you have a question about features, need help with setup, encounter an issue, or simply want to share feedback, we're here for you. Our team is dedicated to ensuring your success with our platform.
            </s-paragraph>
          </s-stack>
        </s-section>

        <s-section heading="Get in Touch">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              If you have any questions, need support, or want to share your thoughts, please don't hesitate to reach out to us:
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
      </s-page>
    );
  }

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

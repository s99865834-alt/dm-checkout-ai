import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

// Shopify's OAuth callback is GET. POSTs to /auth/callback are scanners;
// answer 405 without throwing so Railway does not log a stack trace.
export const action = () => new Response("Method Not Allowed", { status: 405 });

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

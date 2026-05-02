import { redirect } from "react-router";

// Bare app root forwards to /app, which is the standard embedded entry
// point that @shopify/shopify-app-react-router knows how to authenticate.
//
// Why we DON'T call authenticate.admin() here:
//   - When Shopify's hosted Managed Pricing page redirects merchants
//     back to the app's main URL after a charge change, the iframe is
//     loaded at / before App Bridge has had a chance to install the
//     session token. authenticate.admin() then has nothing to validate
//     against and bounces the merchant to /auth/login (the install
//     page) — which manifests as "Install SocialRepl.ai" rendered
//     outside the Shopify admin chrome.
//   - /app/* doesn't have this problem because the framework's embedded
//     entry middleware ensures App Bridge is wired up before the loader
//     runs.
//
// Plan-from-subscription sync moved into app.jsx's parent loader, where
// it runs reliably on every /app/* navigation including the post-billing
// landing.
//
// Query params (shop, host, embedded, id_token, etc.) are preserved on
// the redirect so the framework's embedded entry handler at /app gets
// everything it needs.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app${url.search}`);
};

import { redirect } from "react-router";

export function loader({ request }) {
  const host = new URL(request.url).hostname;

  // Short link domain root → marketing site
  const shortDomain = (process.env.SHORT_LINK_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (shortDomain && host === shortDomain) {
    return redirect("https://www.socialrepl.ai", 301);
  }

  // www.socialrepl.ai root → marketing site (placeholder until landing page exists)
  if (host === "www.socialrepl.ai" || host === "socialrepl.ai") {
    return redirect("https://www.socialrepl.ai/app", 302);
  }

  // Main app domain → Shopify embedded app
  return redirect("/app", 302);
}

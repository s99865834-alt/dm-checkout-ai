import { Outlet, useLoaderData } from "react-router";
import { MarketingNav, MarketingFooter } from "../components/marketing/MarketingChrome";
import { GoogleAnalytics } from "../components/marketing/GoogleAnalytics";

export const loader = () => {
  return { gaId: process.env.GA_MEASUREMENT_ID || "G-BDGNW3KHQD" };
};

// The blog is read-only. POSTs here are WordPress vulnerability scanners
// probing for /wp-json/batch/v1; answer 405 without throwing so Railway does
// not log a stack trace for every request in the spray.
export const action = () => new Response("Method Not Allowed", { status: 405 });

export default function BlogLayout() {
  const { gaId } = useLoaderData() || {};
  return (
    <div className="srMarketingLanding srBlogPage">
      <GoogleAnalytics gaId={gaId} />
      <MarketingNav />
      <main className="srBlogMain">
        <Outlet />
      </main>
      <MarketingFooter />
    </div>
  );
}

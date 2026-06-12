import { Outlet, useLoaderData } from "react-router";
import { MarketingNav, MarketingFooter } from "../components/marketing/MarketingChrome";
import { GoogleAnalytics } from "../components/marketing/GoogleAnalytics";

export const loader = () => {
  return { gaId: process.env.GA_MEASUREMENT_ID || "G-BDGNW3KHQD" };
};

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

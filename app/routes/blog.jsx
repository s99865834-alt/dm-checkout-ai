import { Outlet } from "react-router";
import { MarketingNav, MarketingFooter } from "../components/marketing/MarketingChrome";

export default function BlogLayout() {
  return (
    <div className="srMarketingLanding srBlogPage">
      <MarketingNav />
      <main className="srBlogMain">
        <Outlet />
      </main>
      <MarketingFooter />
    </div>
  );
}

import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  // If there's a shop parameter, redirect to the app
  if (url.searchParams.get("shop")) {
    // If Instagram connection was just completed, redirect to Instagram page
    if (url.searchParams.get("instagram_connected")) {
      const shop = url.searchParams.get("shop");
      throw redirect(`/app?connected=true&shop=${encodeURIComponent(shop || "")}`);
    }
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return {};
};

export default function App() {
  return (
    <div className="srCenteredPage">
      <div>
        <h1 className="srLandingTitle">
          Welcome to socialrepl.ai
        </h1>
        <p className="srLandingSubtitle">
          brought to you by Tennyson Labs
        </p>
      </div>
    </div>
  );
}

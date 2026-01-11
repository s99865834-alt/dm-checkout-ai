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
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      margin: 0,
      fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      <div>
        <h1 style={{
          fontSize: "48px",
          fontWeight: "400",
          color: "#333",
          textAlign: "center",
          margin: 0
        }}>
          Welcome to socialrepl.ai
        </h1>
        <p style={{
          fontSize: "16px",
          fontWeight: "300",
          color: "#666",
          textAlign: "center",
          margin: "8px 0 0 0"
        }}>
          brought to you by Tennyson Labs LLC LLC
        </p>
      </div>
    </div>
  );
}

import { redirect } from "react-router";
import { login } from "../../shopify.server";

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

  // If there's a login function, redirect to login
  if (login) {
    throw redirect("/auth/login");
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
      <h1 style={{
        fontSize: "48px",
        fontWeight: "400",
        color: "#333",
        textAlign: "center",
        margin: 0
      }}>
        Welcome to socialrepl.ai
      </h1>
    </div>
  );
}

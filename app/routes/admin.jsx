import { Form, useLoaderData, useActionData } from "react-router";
import {
  getAdminSession,
  verifyAdminPassword,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  isAdminAuthConfigured,
} from "../lib/admin-auth.server";
import { getAdminDashboardStores } from "../lib/db.server";

export const loader = async ({ request }) => {
  if (!isAdminAuthConfigured()) {
    return new Response(
      "Admin login is not configured. Set ADMIN_PASSWORD (16+ characters) in your environment.",
      { status: 503, headers: { "Content-Type": "text/plain" } }
    );
  }

  if (!getAdminSession(request)) {
    return { authenticated: false, stores: null };
  }

  try {
    const stores = await getAdminDashboardStores();
    return { authenticated: true, stores };
  } catch (err) {
    console.error("Admin dashboard loader error:", err);
    return { authenticated: true, stores: [], error: String(err.message) };
  }
};

export const action = async ({ request }) => {
  if (!isAdminAuthConfigured()) {
    return new Response("Not configured", { status: 503 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "logout") {
    const response = new Response(null, { status: 302, headers: { Location: "/admin" } });
    clearAdminSessionCookie(response);
    return response;
  }

  if (intent === "login") {
    const password = formData.get("password");
    if (!password || typeof password !== "string") {
      return { error: "Password required." };
    }
    if (!verifyAdminPassword(password)) {
      return { error: "Invalid password." };
    }
    const response = new Response(null, { status: 302, headers: { Location: "/admin" } });
    setAdminSessionCookie(response);
    return response;
  }

  return { error: "Unknown action." };
};

function formatTenure(createdAt) {
  if (!createdAt) return "—";
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const months = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (months < 1) {
    const days = Math.round((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (months < 12) return `${Math.round(months)} mo`;
  const years = (months / 12).toFixed(1);
  return `${years} yr`;
}

function formatRevenue(value) {
  if (value == null || value === 0) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function Admin() {
  const { authenticated, stores, error: loaderError } = useLoaderData() ?? {};
  const actionData = useActionData();

  if (!authenticated) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Admin Login</h1>
          <p style={styles.subtitle}>socialrepl.ai admin — sign in to continue.</p>
          <Form method="post" style={styles.form}>
            <input type="hidden" name="intent" value="login" />
            <label style={styles.label}>
              Password
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                style={styles.input}
                autoFocus
              />
            </label>
            {actionData?.error && (
              <p style={styles.error}>{actionData.error}</p>
            )}
            <button type="submit" style={styles.button}>
              Log in
            </button>
          </Form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Stores</h1>
        <Form method="post">
          <input type="hidden" name="intent" value="logout" />
          <button type="submit" style={styles.logoutBtn}>
            Log out
          </button>
        </Form>
      </div>

      {loaderError && (
        <p style={styles.error}>Error loading data: {loaderError}</p>
      )}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Store</th>
              <th style={styles.th}>Tenure</th>
              <th style={styles.th}>Messages sent</th>
              <th style={styles.th}>Revenue attribution</th>
            </tr>
          </thead>
          <tbody>
            {stores && stores.length > 0 ? (
              stores.map((row) => (
                <tr key={row.shop_id}>
                  <td style={styles.td}>
                    <span style={styles.domain}>{row.shopify_domain}</span>
                    {!row.active && <span style={styles.badge}>inactive</span>}
                  </td>
                  <td style={styles.td}>{formatTenure(row.created_at)}</td>
                  <td style={styles.td}>{row.messages_sent.toLocaleString()}</td>
                  <td style={styles.td}>{formatRevenue(row.revenue)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} style={styles.tdEmpty}>
                  No stores yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: "2rem",
    fontFamily: "system-ui, -apple-system, sans-serif",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
  },
  card: {
    maxWidth: "360px",
    margin: "0 auto",
    padding: "2rem",
    backgroundColor: "#1e293b",
    borderRadius: "8px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.2)",
  },
  title: {
    margin: "0 0 0.25rem 0",
    fontSize: "1.5rem",
    fontWeight: 600,
  },
  subtitle: {
    margin: "0 0 1.5rem 0",
    fontSize: "0.875rem",
    color: "#94a3b8",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    fontSize: "0.875rem",
  },
  input: {
    padding: "0.5rem 0.75rem",
    fontSize: "1rem",
    borderRadius: "6px",
    border: "1px solid #334155",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
  },
  error: {
    margin: 0,
    fontSize: "0.875rem",
    color: "#f87171",
  },
  button: {
    padding: "0.5rem 1rem",
    fontSize: "1rem",
    fontWeight: 600,
    color: "#0f172a",
    backgroundColor: "#e2e8f0",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "1.5rem",
  },
  logoutBtn: {
    padding: "0.375rem 0.75rem",
    fontSize: "0.875rem",
    color: "#94a3b8",
    backgroundColor: "transparent",
    border: "1px solid #334155",
    borderRadius: "6px",
    cursor: "pointer",
  },
  tableWrap: {
    overflowX: "auto",
    backgroundColor: "#1e293b",
    borderRadius: "8px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.2)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    textAlign: "left",
    padding: "0.75rem 1rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#94a3b8",
    borderBottom: "1px solid #334155",
  },
  td: {
    padding: "0.75rem 1rem",
    borderBottom: "1px solid #334155",
    fontSize: "0.875rem",
  },
  tdEmpty: {
    padding: "2rem",
    textAlign: "center",
    color: "#64748b",
  },
  domain: {
    fontWeight: 500,
  },
  badge: {
    marginLeft: "0.5rem",
    fontSize: "0.7rem",
    padding: "0.15rem 0.4rem",
    backgroundColor: "#334155",
    borderRadius: "4px",
    color: "#94a3b8",
  },
};

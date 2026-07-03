import { useMemo, useState } from "react";
import { Form, useLoaderData, useActionData } from "react-router";
import {
  getAdminSession,
  verifyAdminPassword,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  isAdminAuthConfigured,
  getAdminAuthDebug,
} from "../lib/admin-auth.server";
import { getAdminDashboardStores, getOutboundQueueOverview, getOutboundQueueItems } from "../lib/db.server";
import { getInstagramAccountInfo } from "../lib/meta.server";
import { getStoreTotalRevenueYTD, getStoreManagedTrial } from "../lib/shopify-data.server";

export const loader = async ({ request }) => {
  if (!isAdminAuthConfigured()) {
    const debug = getAdminAuthDebug();
    console.error("[admin] 503 - env check:", JSON.stringify(debug));
    const body = [
      "Admin login is not configured. In Railway: set ADMIN_PASSWORD (exactly that name, 16+ characters). Then redeploy.",
      "",
      "Debug (what this server sees):",
      `  ADMIN_PASSWORD present: ${debug.ADMIN_PASSWORD_present}`,
      `  ADMIN_SECRET present: ${debug.ADMIN_SECRET_present}`,
      `  value length: ${debug.length} (need 16+)`,
      `  lengthOk: ${debug.lengthOk}`,
    ].join("\n");
    return new Response(body, {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (!getAdminSession(request)) {
    return { authenticated: false, stores: null };
  }

  try {
    const url = new URL(request.url);
    const shopId = url.searchParams.get("queue_shop_id") || null;
    const status = url.searchParams.get("queue_status") || null;
    const stores = await getAdminDashboardStores();

    // Live-lookup Instagram usernames for connected shops in parallel.
    // Falls back to null on failure so a single bad token doesn't break the table.
    const igLookups = await Promise.allSettled(
      stores.map((s) =>
        s.instagram_connected
          ? getInstagramAccountInfo(s.ig_business_id, s.shop_id)
          : Promise.resolve(null)
      )
    );
    const storesWithIg = stores.map((s, i) => {
      const result = igLookups[i];
      const info = result.status === "fulfilled" ? result.value : null;
      return { ...s, instagram_username: info?.username || null };
    });

    // Total Shopify sales YTD per store (live Admin API, cached 1h, best-effort).
    // Each lookup is capped by a timeout so one slow/large store can't hang the
    // whole dashboard; failures fall back to null and render as "—".
    const revLookups = await Promise.allSettled(
      storesWithIg.map((s) =>
        Promise.race([
          getStoreTotalRevenueYTD(s.shopify_domain),
          new Promise((resolve) => setTimeout(() => resolve(null), 12000)),
        ])
      )
    );
    const storesWithRevenue = storesWithIg.map((s, i) => {
      const result = revLookups[i];
      const rev = result.status === "fulfilled" ? result.value : null;
      return {
        ...s,
        total_revenue_ytd: rev ? rev.amount : null,
        total_revenue_currency: rev ? rev.currencyCode : null,
        total_revenue_capped: rev ? rev.capped : false,
      };
    });

    // Live Shopify Managed Pricing trial status per store. Best-effort and
    // timeout-capped like the revenue lookup so one slow/bad token can't hang
    // the dashboard. Merged with the legacy beta trial (from the DB) below.
    const trialLookups = await Promise.allSettled(
      storesWithRevenue.map((s) =>
        Promise.race([
          getStoreManagedTrial(s.shopify_domain),
          new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
        ])
      )
    );
    const storesFinal = storesWithRevenue.map((s, i) => {
      const result = trialLookups[i];
      const managedTrial = result.status === "fulfilled" ? result.value : null;
      // Prefer the live Managed Pricing trial; fall back to a legacy beta trial.
      const trial = managedTrial
        ? { ...managedTrial, source: "managed" }
        : s.beta_trial
          ? { daysLeft: s.beta_trial.daysLeft, trialEndsAt: s.beta_trial.expiresAt, source: "beta" }
          : null;
      return { ...s, trial };
    });

    const queueOverview = await getOutboundQueueOverview({ shopId, status });
    const queueItems = await getOutboundQueueItems({ shopId, status, limit: 50 });
    return { authenticated: true, stores: storesFinal, queueOverview, queueItems, queueFilters: { shopId, status } };
  } catch (err) {
    console.error("Admin dashboard loader error:", err);
    return { authenticated: true, stores: [], queueOverview: null, queueItems: [], error: String(err.message) };
  }
};

export const action = async ({ request }) => {
  if (!isAdminAuthConfigured()) {
    const debug = getAdminAuthDebug();
    console.error("[admin] action 503 - env check:", JSON.stringify(debug));
    return {
      error: "Not configured",
      debug: {
        ADMIN_PASSWORD_present: debug.ADMIN_PASSWORD_present,
        ADMIN_SECRET_present: debug.ADMIN_SECRET_present,
        value_length: debug.length,
        lengthOk: debug.lengthOk,
      },
    };
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

// Display label for a shop's plan enum (FREE / GROWTH / PRO).
function formatPlan(plan) {
  const p = (plan || "FREE").toUpperCase();
  if (p === "PRO") return "Pro";
  if (p === "GROWTH") return "Growth";
  return "Free";
}

// Color-code the plan badge by tier so paying stores stand out at a glance.
function planBadgeStyle(plan) {
  const p = (plan || "FREE").toUpperCase();
  const palette =
    p === "PRO"
      ? { bg: "#4c1d95", fg: "#ede9fe" }
      : p === "GROWTH"
        ? { bg: "#065f46", fg: "#d1fae5" }
        : { bg: "#334155", fg: "#cbd5e1" };
  return {
    display: "inline-block",
    fontSize: "0.75rem",
    fontWeight: 600,
    padding: "0.15rem 0.5rem",
    borderRadius: "999px",
    backgroundColor: palette.bg,
    color: palette.fg,
  };
}

// Clickable column header for the stores table. Clicking toggles the sort
// direction; a second click on a new column starts it descending.
function SortHeader({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === "asc" ? " ▲" : " ▼") : "";
  return (
    <th
      style={{ ...styles.th, cursor: "pointer", userSelect: "none" }}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      title={`Sort by ${label}`}
    >
      {label}
      <span style={styles.sortArrow}>{arrow}</span>
    </th>
  );
}

// Total store sales YTD. Unlike attributed revenue, 0 is a real value (store
// made no sales this year) and is shown as such; null means we couldn't read
// it (no/expired token) and renders as "—". A trailing "+" marks a capped
// lower bound for very high-volume stores.
function formatStoreRevenue(value, currencyCode, capped) {
  if (value == null) return "—";
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode || "USD",
  }).format(value);
  return capped ? `${formatted}+` : formatted;
}

export default function Admin() {
  const { authenticated, stores, queueOverview, queueItems, queueFilters, error: loaderError } = useLoaderData() ?? {};
  const actionData = useActionData();

  const [sort, setSort] = useState({ key: null, dir: "desc" });
  const toggleSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );

  const sortedStores = useMemo(() => {
    if (!stores || !sort.key) return stores;
    const getVal = (row) => {
      switch (sort.key) {
        case "tenure":
          // Tenure = time since install. Sort by that duration; missing
          // created_at has no known tenure and always sinks to the bottom.
          return row.created_at ? Date.now() - new Date(row.created_at).getTime() : null;
        case "messages":
          return row.messages_sent ?? 0;
        case "revenue":
          return row.revenue ?? 0;
        case "storeRevenue":
          // null = couldn't read the figure (no/expired token); sink to bottom.
          return row.total_revenue_ytd;
        default:
          return null;
      }
    };
    return [...stores].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }, [stores, sort]);

  const planCounts = useMemo(() => {
    const counts = { FREE: 0, GROWTH: 0, PRO: 0, trialing: 0 };
    (stores || []).forEach((s) => {
      const p = (s.plan || "FREE").toUpperCase();
      if (counts[p] === undefined) counts[p] = 0;
      counts[p] += 1;
      if (s.trial) counts.trialing += 1;
    });
    return counts;
  }, [stores]);

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
              <>
                <p style={styles.error}>{actionData.error}</p>
                {actionData.debug && (
                  <pre style={styles.debug}>
                    {JSON.stringify(actionData.debug, null, 2)}
                  </pre>
                )}
              </>
            )}
            <button type="submit" style={styles.button}>
              Log in
            </button>
          </Form>
        </div>
      </div>
    );
  }

  const statusLabel = (status) => {
    if (!status) return "All";
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

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

      {stores && stores.length > 0 && (
        <div style={styles.storeSummary}>
          <span style={styles.summaryPill}>{stores.length} stores</span>
          <span style={styles.summaryPill}>{planCounts.FREE} Free</span>
          <span style={styles.summaryPill}>{planCounts.GROWTH} Growth</span>
          <span style={styles.summaryPill}>{planCounts.PRO} Pro</span>
          {planCounts.trialing > 0 && (
            <span style={{ ...styles.summaryPill, ...styles.summaryPillTrial }}>
              {planCounts.trialing} on trial
            </span>
          )}
        </div>
      )}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Store</th>
              <th style={styles.th}>Plan</th>
              <th style={styles.th}>Instagram</th>
              <SortHeader label="Tenure" sortKey="tenure" sort={sort} onSort={toggleSort} />
              <SortHeader label="Messages sent" sortKey="messages" sort={sort} onSort={toggleSort} />
              <SortHeader label="Revenue attribution" sortKey="revenue" sort={sort} onSort={toggleSort} />
              <SortHeader label="Store revenue (YTD)" sortKey="storeRevenue" sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedStores && sortedStores.length > 0 ? (
              sortedStores.map((row) => (
                <tr key={row.shop_id}>
                  <td style={styles.td}>
                    <span style={styles.domain}>{row.shopify_domain}</span>
                    {!row.active && <span style={styles.badge}>inactive</span>}
                  </td>
                  <td style={styles.td}>
                    <span style={planBadgeStyle(row.plan)}>{formatPlan(row.plan)}</span>
                    {row.trial && (
                      <span
                        style={styles.trialBadge}
                        title={
                          (row.trial.source === "beta" ? "Beta trial (PRO)" : "Shopify free trial") +
                          (row.trial.trialEndsAt
                            ? ` · ends ${new Date(row.trial.trialEndsAt).toLocaleDateString()}`
                            : "")
                        }
                      >
                        Trial · {row.trial.daysLeft}d
                      </span>
                    )}
                  </td>
                  <td style={styles.td}>
                    {row.instagram_username ? (
                      <span style={styles.igHandle}>@{row.instagram_username}</span>
                    ) : row.instagram_connected ? (
                      <span style={styles.igConnected}>Connected</span>
                    ) : (
                      <span style={styles.igMuted}>Not connected</span>
                    )}
                  </td>
                  <td style={styles.td}>{formatTenure(row.created_at)}</td>
                  <td style={styles.td}>{row.messages_sent.toLocaleString()}</td>
                  <td style={styles.td}>{formatRevenue(row.revenue)}</td>
                  <td style={styles.td}>
                    {formatStoreRevenue(row.total_revenue_ytd, row.total_revenue_currency, row.total_revenue_capped)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} style={styles.tdEmpty}>
                  No stores yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>DM Queue</h2>
        <Form method="get" style={styles.filters}>
          <label style={styles.filterLabel}>
            Shop
            <select name="queue_shop_id" defaultValue={queueFilters?.shopId || ""} style={styles.select}>
              <option value="">All shops</option>
              {stores && stores.length > 0 && stores.map((row) => (
                <option key={row.shop_id} value={row.shop_id}>{row.shopify_domain}</option>
              ))}
            </select>
          </label>
          <label style={styles.filterLabel}>
            Status
            <select name="queue_status" defaultValue={queueFilters?.status || ""} style={styles.select}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <button type="submit" style={styles.filterBtn}>Apply</button>
        </Form>
      </div>

      <div style={styles.queueSummary}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Total</div>
          <div style={styles.summaryValue}>{queueOverview?.total ?? 0}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Pending</div>
          <div style={styles.summaryValue}>{queueOverview?.counts?.pending ?? 0}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Processing</div>
          <div style={styles.summaryValue}>{queueOverview?.counts?.processing ?? 0}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Sent</div>
          <div style={styles.summaryValue}>{queueOverview?.counts?.sent ?? 0}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Failed</div>
          <div style={styles.summaryValue}>{queueOverview?.counts?.failed ?? 0}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Last Update</div>
          <div style={styles.summaryValueSmall}>
            {queueOverview?.lastUpdatedAt ? new Date(queueOverview.lastUpdatedAt).toLocaleString() : "—"}
          </div>
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Shop</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Attempts</th>
              <th style={styles.th}>Not Before</th>
              <th style={styles.th}>Preview</th>
              <th style={styles.th}>Last Error</th>
            </tr>
          </thead>
          <tbody>
            {queueItems && queueItems.length > 0 ? (
              queueItems.map((row) => (
                <tr key={row.id}>
                  <td style={styles.td}>
                    <span style={styles.domain}>{row.shops?.shopify_domain || row.shop_id}</span>
                  </td>
                  <td style={styles.td}>{statusLabel(row.status)}</td>
                  <td style={styles.td}>{row.attempts}</td>
                  <td style={styles.td}>{row.not_before ? new Date(row.not_before).toLocaleString() : "—"}</td>
                  <td style={styles.td} title={row.text}>{row.text?.slice(0, 60)}{row.text?.length > 60 ? "…" : ""}</td>
                  <td style={styles.td} title={row.last_error || ""}>{row.last_error ? row.last_error.slice(0, 60) : "—"}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={styles.tdEmpty}>
                  No queue items.
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
  debug: {
    margin: "0.5rem 0 0 0",
    padding: "0.5rem",
    fontSize: "0.75rem",
    backgroundColor: "#0f172a",
    borderRadius: "4px",
    color: "#94a3b8",
    overflow: "auto",
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
  sectionHeader: {
    marginTop: "2rem",
    marginBottom: "0.75rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "1rem",
    flexWrap: "wrap",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "1.125rem",
    fontWeight: 600,
  },
  filters: {
    display: "flex",
    gap: "0.75rem",
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  filterLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    fontSize: "0.75rem",
    color: "#94a3b8",
  },
  filterBtn: {
    padding: "0.35rem 0.75rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#0f172a",
    backgroundColor: "#e2e8f0",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  select: {
    padding: "0.35rem 0.5rem",
    borderRadius: "6px",
    border: "1px solid #334155",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    fontSize: "0.75rem",
    minWidth: "160px",
  },
  queueSummary: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  summaryCard: {
    backgroundColor: "#1e293b",
    borderRadius: "8px",
    padding: "0.75rem",
    boxShadow: "0 4px 6px rgba(0,0,0,0.2)",
  },
  summaryLabel: {
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#94a3b8",
  },
  summaryValue: {
    fontSize: "1.2rem",
    fontWeight: 600,
    marginTop: "0.25rem",
  },
  summaryValueSmall: {
    fontSize: "0.8rem",
    fontWeight: 500,
    marginTop: "0.25rem",
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
  sortArrow: {
    color: "#e2e8f0",
    fontSize: "0.7rem",
  },
  storeSummary: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginBottom: "1rem",
  },
  summaryPill: {
    fontSize: "0.8rem",
    fontWeight: 600,
    padding: "0.25rem 0.6rem",
    borderRadius: "999px",
    backgroundColor: "#1e293b",
    color: "#cbd5e1",
    border: "1px solid #334155",
  },
  summaryPillTrial: {
    backgroundColor: "#78350f",
    color: "#fde68a",
    borderColor: "#92400e",
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
  igHandle: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    fontSize: "0.8125rem",
    color: "#e2e8f0",
  },
  igConnected: {
    fontSize: "0.8125rem",
    color: "#22d3ee",
  },
  igMuted: {
    fontSize: "0.8125rem",
    color: "#64748b",
    fontStyle: "italic",
  },
  badge: {
    marginLeft: "0.5rem",
    fontSize: "0.7rem",
    padding: "0.15rem 0.4rem",
    backgroundColor: "#334155",
    borderRadius: "4px",
    color: "#94a3b8",
  },
  trialBadge: {
    marginLeft: "0.5rem",
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "0.15rem 0.4rem",
    backgroundColor: "#78350f",
    borderRadius: "4px",
    color: "#fde68a",
    whiteSpace: "nowrap",
  },
};

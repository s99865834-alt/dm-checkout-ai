import { useOutletContext, useRouteError, useLoaderData, useSearchParams, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getAttributionRecords } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);

  // Parse query parameters for filters
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel") || null;
  const orderId = url.searchParams.get("order_id") || null;
  const startDate = url.searchParams.get("start_date") || null;
  const endDate = url.searchParams.get("end_date") || null;
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  // Fetch attribution records with filters
  const attributionRecords = await getAttributionRecords(shop.id, {
    channel,
    orderId,
    startDate,
    endDate,
    limit,
  });

  return {
    shop,
    plan,
    attributionRecords,
    filters: { channel, orderId, startDate, endDate, limit },
  };
};

export default function AttributionDebugPage() {
  const { shop, plan, attributionRecords, filters } = useLoaderData();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format currency
  const formatCurrency = (amount, currency = "USD") => {
    if (amount === null || amount === undefined) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  };

  // Handle filter form submission
  const handleFilterSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const params = new URLSearchParams();

    // Add non-empty filters to params
    if (formData.get("channel")) params.set("channel", formData.get("channel"));
    if (formData.get("order_id")) params.set("order_id", formData.get("order_id"));
    if (formData.get("start_date")) params.set("start_date", formData.get("start_date"));
    if (formData.get("end_date")) params.set("end_date", formData.get("end_date"));
    if (formData.get("limit")) params.set("limit", formData.get("limit"));

    submit(params, { method: "get" });
  };

  // Clear filters
  const clearFilters = () => {
    submit({}, { method: "get" });
  };

  return (
    <s-page heading="Attribution Debug">
      {shop && plan && (
        <s-section>
          <s-stack direction="inline" gap="base">
            <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
              {plan.name} Plan
            </s-badge>
            <s-text variant="bodyMd" tone="subdued">
              Shop: {shop.shopify_domain}
            </s-text>
          </s-stack>
        </s-section>
      )}

      {/* Filters Section */}
      <s-section heading="Filters">
        <form onSubmit={handleFilterSubmit}>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <label htmlFor="channel">
                    <s-text variant="bodyMd" variant="strong">Channel</s-text>
                  </label>
                  <select
                    id="channel"
                    name="channel"
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      width: "100%",
                    }}
                    defaultValue={filters.channel || ""}
                  >
                    <option value="">All Channels</option>
                    <option value="dm">DM</option>
                    <option value="comment">Comment</option>
                  </select>
                </s-stack>
              </s-box>

              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <label htmlFor="order_id">
                    <s-text variant="bodyMd" variant="strong">Order ID</s-text>
                  </label>
                  <input
                    type="text"
                    id="order_id"
                    name="order_id"
                    placeholder="e.g., 123456789"
                    defaultValue={filters.orderId || ""}
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      width: "100%",
                    }}
                  />
                </s-stack>
              </s-box>

              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <label htmlFor="start_date">
                    <s-text variant="bodyMd" variant="strong">Start Date</s-text>
                  </label>
                  <input
                    type="date"
                    id="start_date"
                    name="start_date"
                    defaultValue={filters.startDate || ""}
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      width: "100%",
                    }}
                  />
                </s-stack>
              </s-box>

              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <label htmlFor="end_date">
                    <s-text variant="bodyMd" variant="strong">End Date</s-text>
                  </label>
                  <input
                    type="date"
                    id="end_date"
                    name="end_date"
                    defaultValue={filters.endDate || ""}
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      width: "100%",
                    }}
                  />
                </s-stack>
              </s-box>

              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <label htmlFor="limit">
                    <s-text variant="bodyMd" variant="strong">Limit</s-text>
                  </label>
                  <input
                    type="number"
                    id="limit"
                    name="limit"
                    min="1"
                    max="200"
                    defaultValue={filters.limit || 50}
                    style={{
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      width: "100%",
                    }}
                  />
                </s-stack>
              </s-box>
            </s-stack>

            <s-stack direction="inline" gap="base">
              <s-button type="submit" variant="primary">
                Apply Filters
              </s-button>
              <s-button type="button" variant="secondary" onClick={clearFilters}>
                Clear Filters
              </s-button>
            </s-stack>
          </s-stack>
        </form>
      </s-section>

      {/* Attribution Records Table */}
      <s-section heading={`Attribution Records (${attributionRecords.length})`}>
        {attributionRecords.length === 0 ? (
          <s-box padding="base">
            <s-text tone="subdued">No attribution records found.</s-text>
          </s-box>
        ) : (
          <s-box padding="base" border="base" borderRadius="base">
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "2px solid #e0e0e0" }}>
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Order ID</th>
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Amount</th>
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Channel</th>
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Link ID</th>
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: "600" }}>Created At</th>
                </tr>
              </thead>
              <tbody>
                {attributionRecords.map((record) => (
                  <tr key={record.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "12px" }}>
                      <s-text variant="bodyMd">{record.order_id || "—"}</s-text>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <s-text variant="bodyMd">{formatCurrency(record.amount, record.currency)}</s-text>
                    </td>
                    <td style={{ padding: "12px" }}>
                      <s-badge tone={record.channel === "dm" ? "info" : record.channel === "comment" ? "success" : "subdued"}>
                        {record.channel || "—"}
                      </s-badge>
                    </td>
                    <td style={{ padding: "12px" }}>
                      {record.link_id ? (
                        <s-link
                          href={`/app/links/${record.link_id}`}
                          style={{ textDecoration: "none" }}
                        >
                          <s-text variant="bodyMd" tone="info">
                            {record.link_id}
                          </s-text>
                        </s-link>
                      ) : (
                        <s-text variant="bodyMd" tone="subdued">—</s-text>
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <s-text variant="bodyMd" tone="subdued">
                        {formatDate(record.created_at)}
                      </s-text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};


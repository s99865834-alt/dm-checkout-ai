import { useLoaderData, useSearchParams, useNavigate, useOutletContext } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { getMessages, getMessageCount } from "../lib/db.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);
  await authenticate.admin(request);

  if (!shop?.id) {
    return { messages: [], totalCount: 0, shop: null };
  }

  // Parse query parameters for filters
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel") || null;
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 50;
  const offset = (page - 1) * limit;
  const startDate = url.searchParams.get("start_date") || null;
  const endDate = url.searchParams.get("end_date") || null;
  const orderBy = url.searchParams.get("order_by") || "created_at";
  const orderDirection = url.searchParams.get("order_direction") || "desc";

  // Fetch messages
  const messages = await getMessages(shop.id, {
    channel,
    limit,
    offset,
    startDate,
    endDate,
    orderBy,
    orderDirection,
  });

  // Get total count for pagination
  const totalCount = await getMessageCount(shop.id, {
    channel,
    startDate,
    endDate,
  });

  const totalPages = Math.ceil(totalCount / limit);

  return {
    shop,
    plan,
    messages,
    totalCount,
    totalPages,
    currentPage: page,
    filters: {
      channel,
      startDate,
      endDate,
      orderBy,
      orderDirection,
    },
  };
};

export default function MessagesPage() {
  const { shop, plan, messages, totalCount, totalPages, currentPage, filters } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const updateFilter = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.delete("page"); // Reset to page 1 when filtering
    navigate(`/app/messages?${newParams.toString()}`);
  };

  const goToPage = (page) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", page.toString());
    navigate(`/app/messages?${newParams.toString()}`);
  };

  return (
    <s-page heading="Message Log">
      {shop && plan && (
        <s-section>
          <s-stack direction="inline" gap="base">
            <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
              {plan.name} Plan
            </s-badge>
            <s-text variant="subdued">
              Total Messages: {totalCount}
            </s-text>
          </s-stack>
        </s-section>
      )}

      <s-section heading="Filters">
        <s-stack direction="inline" gap="base">
          <s-select
            label="Channel"
            value={filters.channel || ""}
            onChange={(e) => updateFilter("channel", e.target.value || null)}
          >
            <option value="">All Channels</option>
            <option value="dm">DM</option>
            <option value="comment">Comment</option>
          </s-select>

          <s-text-field
            label="Start Date"
            type="date"
            value={filters.startDate || ""}
            onChange={(e) => updateFilter("start_date", e.target.value || null)}
          />

          <s-text-field
            label="End Date"
            type="date"
            value={filters.endDate || ""}
            onChange={(e) => updateFilter("end_date", e.target.value || null)}
          />

          <s-select
            label="Sort By"
            value={filters.orderBy}
            onChange={(e) => updateFilter("order_by", e.target.value)}
          >
            <option value="created_at">Date</option>
            <option value="channel">Channel</option>
            <option value="text">Text</option>
          </s-select>

          <s-select
            label="Order"
            value={filters.orderDirection}
            onChange={(e) => updateFilter("order_direction", e.target.value)}
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </s-select>

          <s-button
            variant="secondary"
            onClick={() => navigate("/app/messages")}
          >
            Clear Filters
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Messages">
        {messages.length === 0 ? (
          <s-paragraph>
            <s-text tone="subdued">No messages found.</s-text>
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {messages.map((message) => (
              <s-box
                key={message.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="subdued"
              >
                <s-stack direction="block" gap="tight">
                  <s-stack direction="inline" gap="base" alignment="center">
                    <s-badge tone={message.channel === "dm" ? "info" : "success"}>
                      {message.channel.toUpperCase()}
                    </s-badge>
                    <s-text variant="subdued" style={{ fontSize: "12px" }}>
                      {new Date(message.created_at).toLocaleString()}
                    </s-text>
                    {message.external_id && (
                      <s-text variant="subdued" style={{ fontSize: "12px" }}>
                        ID: {message.external_id.substring(0, 20)}...
                      </s-text>
                    )}
                  </s-stack>

                  {message.text && (
                    <s-paragraph>
                      <s-text>{message.text}</s-text>
                    </s-paragraph>
                  )}

                  {(message.ai_intent || message.sentiment) && (
                    <s-stack direction="inline" gap="base">
                      {message.ai_intent && (
                        <s-badge tone="info">
                          Intent: {message.ai_intent}
                          {message.ai_confidence && ` (${(message.ai_confidence * 100).toFixed(0)}%)`}
                        </s-badge>
                      )}
                      {message.sentiment && (
                        <s-badge tone={message.sentiment === "positive" ? "success" : message.sentiment === "negative" ? "critical" : "subdued"}>
                          {message.sentiment}
                        </s-badge>
                      )}
                    </s-stack>
                  )}

                  {message.from_user_id && (
                    <s-text variant="subdued" style={{ fontSize: "12px" }}>
                      From: {message.from_user_id}
                    </s-text>
                  )}
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <s-stack direction="inline" gap="base" alignment="center" style={{ marginTop: "1rem" }}>
            <s-button
              variant="secondary"
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              Previous
            </s-button>
            <s-text variant="subdued">
              Page {currentPage} of {totalPages}
            </s-text>
            <s-button
              variant="secondary"
              disabled={currentPage === totalPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next
            </s-button>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary({ error }) {
  return boundary.error(error);
}


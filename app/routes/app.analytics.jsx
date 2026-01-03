import { useState } from "react";
import { useOutletContext, useRouteError, useLoaderData, useSearchParams, useSubmit, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";
import { getAttributionRecords, getMessages, getMessageCount, getAnalytics, getProAnalytics } from "../lib/db.server";

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

  // Parse message filters (separate from attribution filters)
  const messageChannel = url.searchParams.get("message_channel") || null;
  const messagePage = parseInt(url.searchParams.get("message_page") || "1", 10);
  const messageLimit = 50;
  const messageOffset = (messagePage - 1) * messageLimit;
  const messageStartDate = url.searchParams.get("message_start_date") || null;
  const messageEndDate = url.searchParams.get("message_end_date") || null;
  const messageOrderBy = url.searchParams.get("message_order_by") || "created_at";
  const messageOrderDirection = url.searchParams.get("message_order_direction") || "desc";

  // Parse analytics date range (defaults to last 30 days)
  const analyticsStartDate = url.searchParams.get("analytics_start_date") || null;
  const analyticsEndDate = url.searchParams.get("analytics_end_date") || null;

  // Fetch attribution records with filters
  const attributionRecords = await getAttributionRecords(shop.id, {
    channel,
    orderId,
    startDate,
    endDate,
    limit,
  });

  // Fetch messages with filters
  let messages = [];
  let messageTotalCount = 0;
  let messageTotalPages = 0;
  if (shop?.id) {
    messages = await getMessages(shop.id, {
      channel: messageChannel,
      limit: messageLimit,
      offset: messageOffset,
      startDate: messageStartDate,
      endDate: messageEndDate,
      orderBy: messageOrderBy,
      orderDirection: messageOrderDirection,
    });

    messageTotalCount = await getMessageCount(shop.id, {
      channel: messageChannel,
      startDate: messageStartDate,
      endDate: messageEndDate,
    });

    messageTotalPages = Math.ceil(messageTotalCount / messageLimit);
  }

  // Fetch analytics data
  let analytics = null;
  let proAnalytics = null;
  if (shop?.id && plan?.name) {
    analytics = await getAnalytics(shop.id, plan.name, {
      startDate: analyticsStartDate,
      endDate: analyticsEndDate,
    });

    // Fetch Pro analytics if PRO plan
    if (plan.name === "PRO") {
      proAnalytics = await getProAnalytics(shop.id, {
        startDate: analyticsStartDate,
        endDate: analyticsEndDate,
      });
    }
  }

  return {
    shop,
    plan,
    attributionRecords,
    filters: { channel, orderId, startDate, endDate, limit },
    messages,
    messageTotalCount,
    messageTotalPages,
    messageCurrentPage: messagePage,
    messageFilters: {
      channel: messageChannel,
      startDate: messageStartDate,
      endDate: messageEndDate,
      orderBy: messageOrderBy,
      orderDirection: messageOrderDirection,
    },
    analytics,
    proAnalytics,
    analyticsFilters: {
      startDate: analyticsStartDate,
      endDate: analyticsEndDate,
    },
  };
};

export default function AnalyticsPage() {
  const { shop, plan } = useOutletContext() || {};
  const { hasAccess, isFree, isGrowth, isPro } = usePlanAccess();
  const { attributionRecords, filters, messages, messageTotalCount, messageTotalPages, messageCurrentPage, messageFilters, analytics, proAnalytics, analyticsFilters } = useLoaderData();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const navigate = useNavigate();
  const [expandedMessages, setExpandedMessages] = useState(new Set());

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
    const params = new URLSearchParams(searchParams);

    // Add non-empty filters to params
    if (formData.get("channel")) {
      params.set("channel", formData.get("channel"));
    } else {
      params.delete("channel");
    }
    if (formData.get("order_id")) {
      params.set("order_id", formData.get("order_id"));
    } else {
      params.delete("order_id");
    }
    if (formData.get("start_date")) {
      params.set("start_date", formData.get("start_date"));
    } else {
      params.delete("start_date");
    }
    if (formData.get("end_date")) {
      params.set("end_date", formData.get("end_date"));
    } else {
      params.delete("end_date");
    }
    if (formData.get("limit")) {
      params.set("limit", formData.get("limit"));
    } else {
      params.delete("limit");
    }

    navigate(`/app/analytics?${params.toString()}`, { replace: true, preventScrollReset: true });
  };

  // Clear filters
  const clearFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("channel");
    params.delete("order_id");
    params.delete("start_date");
    params.delete("end_date");
    params.delete("limit");
    navigate(`/app/analytics?${params.toString()}`, { replace: true, preventScrollReset: true });
  };

  // Message filter handlers - use replace to prevent scroll jump
  const updateMessageFilter = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    newParams.delete("message_page"); // Reset to page 1 when filtering
    navigate(`/app/analytics?${newParams.toString()}`, { replace: true, preventScrollReset: true });
  };

  const goToMessagePage = (page) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("message_page", page.toString());
    navigate(`/app/analytics?${newParams.toString()}`, { replace: true, preventScrollReset: true });
  };

  const clearMessageFilters = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("message_channel");
    newParams.delete("message_start_date");
    newParams.delete("message_end_date");
    newParams.delete("message_order_by");
    newParams.delete("message_order_direction");
    newParams.delete("message_page");
    navigate(`/app/analytics?${newParams.toString()}`, { replace: true, preventScrollReset: true });
  };

  const toggleMessageExpanded = (messageId) => {
    setExpandedMessages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

    return (
      <s-page heading="Analytics">
        <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 16px" }}>
          {shop && plan && (
            <s-section>
              <s-stack direction="inline" gap="base">
                <s-badge tone={plan.name === "FREE" ? "subdued" : plan.name === "GROWTH" ? "info" : "success"}>
                  {plan.name} Plan
                </s-badge>
              </s-stack>
            </s-section>
          )}

          {/* Analytics Date Range Filter */}
          <s-section heading="Analytics">
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const params = new URLSearchParams(searchParams);
                if (formData.get("analytics_start_date")) {
                  params.set("analytics_start_date", formData.get("analytics_start_date"));
                } else {
                  params.delete("analytics_start_date");
                }
                if (formData.get("analytics_end_date")) {
                  params.set("analytics_end_date", formData.get("analytics_end_date"));
                } else {
                  params.delete("analytics_end_date");
                }
                navigate(`/app/analytics?${params.toString()}`, { replace: true, preventScrollReset: true });
              }}>
                <s-stack direction="inline" gap="base" alignment="end">
                  <label>
                    <s-text variant="subdued" style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>Start Date</s-text>
                    <input
                      type="date"
                      name="analytics_start_date"
                      defaultValue={analyticsFilters?.startDate || ""}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #e1e3e5" }}
                    />
                  </label>
                  <label>
                    <s-text variant="subdued" style={{ fontSize: "12px", display: "block", marginBottom: "4px" }}>End Date</s-text>
                    <input
                      type="date"
                      name="analytics_end_date"
                      defaultValue={analyticsFilters?.endDate || ""}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #e1e3e5" }}
                    />
                  </label>
                  <s-button type="submit" variant="secondary">Apply</s-button>
                  {analyticsFilters?.startDate || analyticsFilters?.endDate ? (
                    <s-button
                      type="button"
                      variant="plain"
                      onClick={() => {
                        const params = new URLSearchParams(searchParams);
                        params.delete("analytics_start_date");
                        params.delete("analytics_end_date");
                        navigate(`/app/analytics?${params.toString()}`, { replace: true, preventScrollReset: true });
                      }}
                    >
                      Clear
                    </s-button>
                  ) : null}
                </s-stack>
              </form>
            </s-box>
          </s-section>

          {/* Analytics - Progressive display based on plan tier */}
          <s-section heading="Analytics">
            {analytics ? (
              <>
                {analytics.messagesSent === 0 && analytics.linksSent === 0 ? (
                  <s-box padding="base" borderWidth="base" borderRadius="base">
                    <s-stack direction="block" gap="tight">
                      <s-text variant="strong">No data yet</s-text>
                      <s-text variant="subdued">
                        Once you start receiving messages and sending links, your analytics will appear here.
                      </s-text>
                    </s-stack>
                  </s-box>
                ) : (
                  <>
                    {/* Free Tier Metrics - Everyone sees these */}
                    <div style={{ 
                      display: "grid", 
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
                      gap: "16px",
                      marginBottom: "24px"
                    }}>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="subdued" style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            Messages Sent
                          </s-text>
                          <s-text variant="headingLg" style={{ fontSize: "32px", fontWeight: "600" }}>
                            {analytics.messagesSent || 0}
                            {plan?.name === "FREE" && (
                              <s-text variant="subdued" style={{ fontSize: "14px", fontWeight: "400" }}> / {plan?.cap || 25}</s-text>
                            )}
                          </s-text>
                        </s-stack>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="subdued" style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            Links Sent
                          </s-text>
                          <s-text variant="headingLg" style={{ fontSize: "32px", fontWeight: "600" }}>
                            {analytics.linksSent || 0}
                          </s-text>
                        </s-stack>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="subdued" style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            Clicks
                          </s-text>
                          <s-text variant="headingLg" style={{ fontSize: "32px", fontWeight: "600" }}>
                            {analytics.clicks || 0}
                          </s-text>
                        </s-stack>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="subdued" style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            Click-Through Rate
                          </s-text>
                          <s-text variant="headingLg" style={{ fontSize: "32px", fontWeight: "600" }}>
                            {analytics.ctr ? `${analytics.ctr.toFixed(1)}%` : "0%"}
                          </s-text>
                        </s-stack>
                      </s-box>
                    </div>

                    {analytics.topTriggerPhrases && analytics.topTriggerPhrases.length > 0 && (
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base" style={{ marginBottom: "24px" }}>
                        <s-stack direction="block" gap="base">
                          <s-text variant="strong" style={{ fontSize: "16px" }}>Top Trigger Phrases</s-text>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {analytics.topTriggerPhrases.map((phrase, idx) => (
                              <s-badge key={idx} tone="info" style={{ fontSize: "13px" }}>
                                {phrase.intent} ({phrase.count})
                              </s-badge>
                            ))}
                          </div>
                        </s-stack>
                      </s-box>
                    )}

                    {/* Growth Tier Metrics - Growth and Pro see these */}
                    <PlanGate requiredPlan="GROWTH" feature="Channel Performance Analytics">
                      {analytics.channelPerformance ? (
                        <s-box padding="base" borderWidth="base" borderRadius="base" background="base" style={{ marginBottom: "24px" }}>
                          <s-stack direction="block" gap="base">
                            <s-text variant="strong" style={{ fontSize: "16px" }}>Channel Performance</s-text>
                            <div style={{ 
                              display: "grid", 
                              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", 
                              gap: "16px"
                            }}>
                              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                <s-stack direction="block" gap="base">
                                  <s-text variant="strong" style={{ fontSize: "14px" }}>Direct Messages</s-text>
                                  <s-stack direction="block" gap="tight">
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued" style={{ fontSize: "12px" }}>Sent: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.dm.sent}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued" style={{ fontSize: "12px" }}>Responded: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.dm.responded}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued" style={{ fontSize: "12px" }}>Clicks: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.dm.clicks}</s-text>
                                    </s-text>
                                    {analytics.channelPerformance.dm.sent > 0 && (
                                      <s-text variant="bodyMd">
                                        <s-text variant="subdued" style={{ fontSize: "12px" }}>CTR: </s-text>
                                        <s-text variant="strong">{((analytics.channelPerformance.dm.clicks / analytics.channelPerformance.dm.sent) * 100).toFixed(1)}%</s-text>
                                      </s-text>
                                    )}
                                  </s-stack>
                                </s-stack>
                              </s-box>
                              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                <s-stack direction="block" gap="base">
                                  <s-text variant="strong" style={{ fontSize: "14px" }}>Comments</s-text>
                                  <s-stack direction="block" gap="tight">
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued" style={{ fontSize: "12px" }}>Sent: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.comment.sent}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued" style={{ fontSize: "12px" }}>Responded: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.comment.responded}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued" style={{ fontSize: "12px" }}>Clicks: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.comment.clicks}</s-text>
                                    </s-text>
                                    {analytics.channelPerformance.comment.sent > 0 && (
                                      <s-text variant="bodyMd">
                                        <s-text variant="subdued" style={{ fontSize: "12px" }}>CTR: </s-text>
                                        <s-text variant="strong">{((analytics.channelPerformance.comment.clicks / analytics.channelPerformance.comment.sent) * 100).toFixed(1)}%</s-text>
                                      </s-text>
                                    )}
                                  </s-stack>
                                </s-stack>
                              </s-box>
                            </div>
                          </s-stack>
                        </s-box>
                      ) : null}
                    </PlanGate>

                    {/* Pro Tier Metrics - Only Pro sees these */}
                    <PlanGate requiredPlan="PRO" feature="Pro Analytics">
                      {proAnalytics ? (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
                          {/* Customer Segments */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <s-stack direction="block" gap="base">
                              <s-text variant="strong" style={{ fontSize: "16px" }}>Customer Segments</s-text>
                              <s-stack direction="block" gap="tight">
                                <s-text variant="bodyMd">
                                  <s-text variant="subdued" style={{ fontSize: "12px" }}>Total: </s-text>
                                  <s-text variant="strong">{proAnalytics.customerSegments.total}</s-text>
                                </s-text>
                                <s-text variant="bodyMd">
                                  <s-text variant="subdued" style={{ fontSize: "12px" }}>First-Time: </s-text>
                                  <s-text variant="strong">{proAnalytics.customerSegments.firstTime}</s-text>
                                </s-text>
                                <s-text variant="bodyMd">
                                  <s-text variant="subdued" style={{ fontSize: "12px" }}>Repeat: </s-text>
                                  <s-text variant="strong">{proAnalytics.customerSegments.repeat}</s-text>
                                </s-text>
                                {proAnalytics.customerSegments.total > 0 && (
                                  <s-text variant="bodyMd">
                                    <s-text variant="subdued" style={{ fontSize: "12px" }}>Repeat Rate: </s-text>
                                    <s-text variant="strong">{((proAnalytics.customerSegments.repeat / proAnalytics.customerSegments.total) * 100).toFixed(1)}%</s-text>
                                  </s-text>
                                )}
                              </s-stack>
                            </s-stack>
                          </s-box>

                          {/* Sentiment Analysis */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <s-stack direction="block" gap="base">
                              <s-text variant="strong" style={{ fontSize: "16px" }}>Sentiment Analysis</s-text>
                              {proAnalytics.sentimentAnalysis.total > 0 ? (
                                <s-stack direction="block" gap="tight">
                                  <s-text variant="bodyMd">
                                    <s-text variant="subdued" style={{ fontSize: "12px" }}>Analyzed: </s-text>
                                    <s-text variant="strong">{proAnalytics.sentimentAnalysis.total}</s-text>
                                  </s-text>
                                  <s-text variant="bodyMd">
                                    <s-badge tone="success" style={{ marginRight: "8px" }}>Positive</s-badge>
                                    {proAnalytics.sentimentAnalysis.positive} ({((proAnalytics.sentimentAnalysis.positive / proAnalytics.sentimentAnalysis.total) * 100).toFixed(1)}%)
                                  </s-text>
                                  <s-text variant="bodyMd">
                                    <s-badge tone="subdued" style={{ marginRight: "8px" }}>Neutral</s-badge>
                                    {proAnalytics.sentimentAnalysis.neutral} ({((proAnalytics.sentimentAnalysis.neutral / proAnalytics.sentimentAnalysis.total) * 100).toFixed(1)}%)
                                  </s-text>
                                  <s-text variant="bodyMd">
                                    <s-badge tone="critical" style={{ marginRight: "8px" }}>Negative</s-badge>
                                    {proAnalytics.sentimentAnalysis.negative} ({((proAnalytics.sentimentAnalysis.negative / proAnalytics.sentimentAnalysis.total) * 100).toFixed(1)}%)
                                  </s-text>
                                </s-stack>
                              ) : (
                                <s-text variant="subdued" style={{ fontSize: "13px" }}>No sentiment data available yet</s-text>
                              )}
                            </s-stack>
                          </s-box>

                          {/* Revenue Attribution */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <s-stack direction="block" gap="base">
                              <s-text variant="strong" style={{ fontSize: "16px" }}>Revenue Attribution</s-text>
                              <s-stack direction="block" gap="tight">
                                <s-text variant="headingMd" style={{ fontSize: "24px", fontWeight: "600" }}>
                                  {formatCurrency(proAnalytics.revenueAttribution.total, proAnalytics.revenueAttribution.currency)}
                                </s-text>
                                <s-text variant="bodyMd" style={{ marginTop: "8px" }}>
                                  <s-text variant="subdued" style={{ fontSize: "12px" }}>From DMs: </s-text>
                                  <s-text variant="strong">{formatCurrency(proAnalytics.revenueAttribution.byChannel.dm, proAnalytics.revenueAttribution.currency)}</s-text>
                                </s-text>
                                <s-text variant="bodyMd">
                                  <s-text variant="subdued" style={{ fontSize: "12px" }}>From Comments: </s-text>
                                  <s-text variant="strong">{formatCurrency(proAnalytics.revenueAttribution.byChannel.comment, proAnalytics.revenueAttribution.currency)}</s-text>
                                </s-text>
                              </s-stack>
                            </s-stack>
                          </s-box>

                          {/* Follow-Up Performance */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <s-stack direction="block" gap="base">
                              <s-text variant="strong" style={{ fontSize: "16px" }}>Follow-Up Performance</s-text>
                              <s-stack direction="block" gap="base">
                                <div>
                                  <s-text variant="subdued" style={{ fontSize: "12px", fontWeight: "600" }}>With Follow-Up</s-text>
                                  <s-stack direction="block" gap="tight" style={{ marginTop: "4px" }}>
                                    <s-text variant="bodyMd" style={{ fontSize: "13px" }}>
                                      <s-text variant="subdued">Messages: </s-text>
                                      <s-text variant="strong">{proAnalytics.followUpPerformance.withFollowup.messages}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd" style={{ fontSize: "13px" }}>
                                      <s-text variant="subdued">CTR: </s-text>
                                      <s-text variant="strong">{proAnalytics.followUpPerformance.withFollowup.ctr.toFixed(1)}%</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd" style={{ fontSize: "13px" }}>
                                      <s-text variant="subdued">Revenue: </s-text>
                                      <s-text variant="strong">{formatCurrency(proAnalytics.followUpPerformance.withFollowup.revenue, proAnalytics.revenueAttribution.currency)}</s-text>
                                    </s-text>
                                  </s-stack>
                                </div>
                                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e1e3e5" }}>
                                  <s-text variant="subdued" style={{ fontSize: "12px", fontWeight: "600" }}>Without Follow-Up</s-text>
                                  <s-stack direction="block" gap="tight" style={{ marginTop: "4px" }}>
                                    <s-text variant="bodyMd" style={{ fontSize: "13px" }}>
                                      <s-text variant="subdued">Messages: </s-text>
                                      <s-text variant="strong">{proAnalytics.followUpPerformance.withoutFollowup.messages}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd" style={{ fontSize: "13px" }}>
                                      <s-text variant="subdued">CTR: </s-text>
                                      <s-text variant="strong">{proAnalytics.followUpPerformance.withoutFollowup.ctr.toFixed(1)}%</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd" style={{ fontSize: "13px" }}>
                                      <s-text variant="subdued">Revenue: </s-text>
                                      <s-text variant="strong">{formatCurrency(proAnalytics.followUpPerformance.withoutFollowup.revenue, proAnalytics.revenueAttribution.currency)}</s-text>
                                    </s-text>
                                  </s-stack>
                                </div>
                              </s-stack>
                            </s-stack>
                          </s-box>
                        </div>
                      ) : null}
                    </PlanGate>
                  </>
                )}
              </>
            ) : (
              <s-paragraph>
                <s-text variant="subdued">Loading analytics...</s-text>
              </s-paragraph>
            )}
          </s-section>

          {/* Attribution Debug Section */}
          <s-section heading="Order Attribution">
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued" style={{ marginBottom: "16px" }}>
              <s-text variant="bodyMd" tone="subdued">
                Track which orders came from Instagram DMs and comments via attribution links.
              </s-text>
            </s-box>

            {/* Filters Section */}
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued" style={{ marginBottom: "16px" }}>
              <s-stack direction="block" gap="base">
                <s-text variant="strong" style={{ fontSize: "14px" }}>Filters</s-text>
              <form onSubmit={handleFilterSubmit}>
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-box padding="tight" border="base" borderRadius="base" style={{ flex: "1" }}>
                      <s-stack direction="block" gap="tight">
                        <label htmlFor="channel">
                          <s-text variant="strong">Channel</s-text>
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

                    <s-box padding="tight" border="base" borderRadius="base" style={{ flex: "1" }}>
                      <s-stack direction="block" gap="tight">
                        <label htmlFor="order_id">
                          <s-text variant="strong">Order ID</s-text>
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

                    <s-box padding="tight" border="base" borderRadius="base" style={{ flex: "1" }}>
                      <s-stack direction="block" gap="tight">
                        <label htmlFor="start_date">
                          <s-text variant="strong">Start Date</s-text>
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

                    <s-box padding="tight" border="base" borderRadius="base" style={{ flex: "1" }}>
                      <s-stack direction="block" gap="tight">
                        <label htmlFor="end_date">
                          <s-text variant="strong">End Date</s-text>
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

                    <s-box padding="tight" border="base" borderRadius="base" style={{ flex: "1" }}>
                      <s-stack direction="block" gap="tight">
                        <label htmlFor="limit">
                          <s-text variant="strong">Limit</s-text>
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
            </s-stack>
          </s-box>

          {/* Attribution Records Table */}
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-text variant="headingMd">Attribution Records ({attributionRecords.length})</s-text>
              {attributionRecords.length === 0 ? (
                <s-box padding="base">
                  <s-text tone="subdued">No attribution records found.</s-text>
                </s-box>
              ) : (
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
              )}
            </s-stack>
          </s-box>
          </s-section>

          {/* Message Log Section */}
          <PlanGate requiredPlan="GROWTH" feature="Message Log">
            <s-section heading="Message Log">
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued" style={{ marginBottom: "16px" }}>
                <s-text variant="bodyMd">
                  <s-text variant="subdued">Total Messages: </s-text>
                  <s-text variant="strong">{messageTotalCount}</s-text>
                </s-text>
              </s-box>

            {/* Message Filters */}
            <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base" alignment="center">
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <s-text variant="subdued" style={{ fontSize: "12px" }}>Channel</s-text>
                    <select
                      value={messageFilters.channel || ""}
                      onChange={(e) => updateMessageFilter("message_channel", e.target.value || null)}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #e1e3e5" }}
                    >
                      <option value="">All Channels</option>
                      <option value="dm">DM</option>
                      <option value="comment">Comment</option>
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <s-text variant="subdued" style={{ fontSize: "12px" }}>Start Date</s-text>
                    <input
                      type="date"
                      value={messageFilters.startDate || ""}
                      onChange={(e) => updateMessageFilter("message_start_date", e.target.value || null)}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #e1e3e5" }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <s-text variant="subdued" style={{ fontSize: "12px" }}>End Date</s-text>
                    <input
                      type="date"
                      value={messageFilters.endDate || ""}
                      onChange={(e) => updateMessageFilter("message_end_date", e.target.value || null)}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #e1e3e5" }}
                    />
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <s-text variant="subdued" style={{ fontSize: "12px" }}>Sort By</s-text>
                    <select
                      value={messageFilters.orderBy}
                      onChange={(e) => updateMessageFilter("message_order_by", e.target.value)}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #e1e3e5" }}
                    >
                      <option value="created_at">Date</option>
                      <option value="channel">Channel</option>
                      <option value="text">Text</option>
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <s-text variant="subdued" style={{ fontSize: "12px" }}>Order</s-text>
                    <select
                      value={messageFilters.orderDirection}
                      onChange={(e) => updateMessageFilter("message_order_direction", e.target.value)}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #e1e3e5" }}
                    >
                      <option value="desc">Newest First</option>
                      <option value="asc">Oldest First</option>
                    </select>
                  </label>

                  <s-button
                    variant="secondary"
                    onClick={clearMessageFilters}
                  >
                    Clear Filters
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>

            {/* Messages List */}
            {messages.length === 0 ? (
              <s-paragraph>
                <s-text tone="subdued">No messages found.</s-text>
              </s-paragraph>
            ) : (
              <s-stack direction="block" gap="base">
                {messages.map((message) => {
                  const isExpanded = expandedMessages.has(message.id);
                  return (
                    <s-box
                      key={message.id}
                      padding="base"
                      borderWidth="base"
                      borderRadius="base"
                      background="subdued"
                    >
                      <s-stack direction="block" gap="base">
                        {/* Header with metadata */}
                        <s-stack direction="inline" gap="base" alignment="space-between" style={{ width: "100%" }}>
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
                          {message.from_user_id && (
                            <s-text variant="subdued" style={{ fontSize: "12px" }}>
                              From: {message.from_user_id}
                            </s-text>
                          )}
                        </s-stack>

                        {/* Badges for intent, sentiment, and AI response */}
                        <s-stack direction="inline" gap="base" alignment="center">
                          {message.ai_responded && (
                            <s-badge tone="success">
                              AI Responded
                            </s-badge>
                          )}
                          {!message.ai_responded && (
                            <s-badge tone="subdued">
                              No Response
                            </s-badge>
                          )}
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

                        <s-button
                          variant="plain"
                          onClick={() => toggleMessageExpanded(message.id)}
                          style={{ padding: "4px 8px", fontSize: "12px", alignSelf: "flex-start" }}
                        >
                          {isExpanded ? "Hide Conversation" : "Show Conversation"}
                        </s-button>

                        {/* Collapsible Conversation */}
                        {isExpanded && (
                          <s-stack direction="block" gap="base">
                            {/* Customer Message */}
                            <s-box padding="tight" borderWidth="base" borderRadius="base" background="base">
                              <s-stack direction="block" gap="tight">
                                <s-text variant="strong" style={{ fontSize: "12px", marginBottom: "4px" }}>
                                  Customer Message:
                                </s-text>
                                {message.text ? (
                                  <s-paragraph>
                                    <s-text>{message.text}</s-text>
                                  </s-paragraph>
                                ) : (
                                  <s-text variant="subdued" style={{ fontSize: "12px" }}>No message text</s-text>
                                )}
                              </s-stack>
                            </s-box>

                            {/* AI Response - only show if AI responded */}
                            {message.ai_responded && (
                              <s-box padding="tight" borderWidth="base" borderRadius="base" background="base">
                                <s-stack direction="block" gap="tight">
                                  <s-text variant="strong" style={{ fontSize: "12px", marginBottom: "4px" }}>
                                    AI Response:
                                    {message.ai_response_sent_at && (
                                      <s-text variant="subdued" style={{ fontSize: "11px", marginLeft: "8px", fontWeight: "normal" }}>
                                        ({new Date(message.ai_response_sent_at).toLocaleString()})
                                      </s-text>
                                    )}
                                  </s-text>
                                  {message.ai_response_text ? (
                                    <s-paragraph>
                                      <s-text style={{ fontSize: "13px", whiteSpace: "pre-wrap" }}>
                                        {message.ai_response_text}
                                      </s-text>
                                    </s-paragraph>
                                  ) : (
                                    <s-paragraph>
                                      <s-text variant="subdued" style={{ fontSize: "13px", fontStyle: "italic" }}>
                                        AI sent a checkout link
                                        {message.ai_response_link_id && (
                                          <>
                                            {" "}
                                            <s-link
                                              href={`/app/links/${message.ai_response_link_id}`}
                                              style={{ textDecoration: "none" }}
                                            >
                                              <s-text variant="bodyMd" tone="info" style={{ fontSize: "12px" }}>
                                                (View link)
                                              </s-text>
                                            </s-link>
                                          </>
                                        )}
                                      </s-text>
                                    </s-paragraph>
                                  )}
                                  {message.ai_response_link_id && message.ai_response_text && (
                                    <s-link
                                      href={`/app/links/${message.ai_response_link_id}`}
                                      style={{ textDecoration: "none", fontSize: "12px" }}
                                    >
                                      <s-text variant="bodyMd" tone="info" style={{ fontSize: "12px" }}>
                                        View checkout link →
                                      </s-text>
                                    </s-link>
                                  )}
                                </s-stack>
                              </s-box>
                            )}
                          </s-stack>
                        )}
                      </s-stack>
                    </s-box>
                  );
                })}
              </s-stack>
            )}

              {/* Message Pagination */}
              {messageTotalPages > 1 && (
                <s-stack direction="inline" gap="base" alignment="center" style={{ marginTop: "1rem" }}>
                  <s-button
                    variant="secondary"
                    disabled={messageCurrentPage === 1}
                    onClick={() => goToMessagePage(messageCurrentPage - 1)}
                  >
                    Previous
                  </s-button>
                  <s-text variant="subdued">
                    Page {messageCurrentPage} of {messageTotalPages}
                  </s-text>
                  <s-button
                    variant="secondary"
                    disabled={messageCurrentPage === messageTotalPages}
                    onClick={() => goToMessagePage(messageCurrentPage + 1)}
                  >
                    Next
                  </s-button>
                </s-stack>
              )}
            </s-section>
          </PlanGate>
        </div>
      </s-page>
    );
  }

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
  }
  
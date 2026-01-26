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
                  <label className="srFieldLabel">
                    <s-text variant="subdued">Start Date</s-text>
                    <input
                      type="date"
                      name="analytics_start_date"
                      defaultValue={analyticsFilters?.startDate || ""}
                      className="srInput"
                    />
                  </label>
                  <label className="srFieldLabel">
                    <s-text variant="subdued">End Date</s-text>
                    <input
                      type="date"
                      name="analytics_end_date"
                      defaultValue={analyticsFilters?.endDate || ""}
                      className="srInput"
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
                    <s-stack direction="block" gap="base">
                    <div className="srKpiGrid">
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="subdued">Messages Sent</s-text>
                          <s-text variant="headingLg">
                            {analytics.messagesSent || 0}
                            {plan?.name === "FREE" && (
                              <s-text variant="subdued" as="span"> / {plan?.cap || 25}</s-text>
                            )}
                          </s-text>
                        </s-stack>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="subdued">Links Sent</s-text>
                          <s-text variant="headingLg">
                            {analytics.linksSent || 0}
                          </s-text>
                        </s-stack>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="subdued">Clicks</s-text>
                          <s-text variant="headingLg">
                            {analytics.clicks || 0}
                          </s-text>
                        </s-stack>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <s-stack direction="block" gap="tight">
                          <s-text variant="subdued">Click-Through Rate</s-text>
                          <s-text variant="headingLg">
                            {analytics.ctr ? `${analytics.ctr.toFixed(1)}%` : "0%"}
                          </s-text>
                        </s-stack>
                      </s-box>
                    </div>

                    {analytics.topTriggerPhrases && analytics.topTriggerPhrases.length > 0 && (
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <s-stack direction="block" gap="base">
                          <s-text variant="strong">Top Trigger Phrases</s-text>
                          <div className="srWrapRow">
                            {analytics.topTriggerPhrases.map((phrase, idx) => (
                              <s-badge key={idx} tone="info">
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
                        <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                          <s-stack direction="block" gap="base">
                            <s-text variant="strong">Channel Performance</s-text>
                            <div className="srGridAuto250">
                              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                <s-stack direction="block" gap="base">
                                  <s-text variant="strong">Direct Messages</s-text>
                                  <s-stack direction="block" gap="tight">
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">Sent: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.dm.sent}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">Responded: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.dm.responded}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">Clicks: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.dm.clicks}</s-text>
                                    </s-text>
                                    {analytics.channelPerformance.dm.sent > 0 && (
                                      <s-text variant="bodyMd">
                                        <s-text variant="subdued">CTR: </s-text>
                                        <s-text variant="strong">{((analytics.channelPerformance.dm.clicks / analytics.channelPerformance.dm.sent) * 100).toFixed(1)}%</s-text>
                                      </s-text>
                                    )}
                                  </s-stack>
                                </s-stack>
                              </s-box>
                              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                <s-stack direction="block" gap="base">
                                  <s-text variant="strong">Comments</s-text>
                                  <s-stack direction="block" gap="tight">
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">Sent: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.comment.sent}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">Responded: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.comment.responded}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">Clicks: </s-text>
                                      <s-text variant="strong">{analytics.channelPerformance.comment.clicks}</s-text>
                                    </s-text>
                                    {analytics.channelPerformance.comment.sent > 0 && (
                                      <s-text variant="bodyMd">
                                        <s-text variant="subdued">CTR: </s-text>
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
                        <div className="srGridAuto280">
                          {/* Customer Segments */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <s-stack direction="block" gap="base">
                              <s-text variant="strong">Customer Segments</s-text>
                              <s-stack direction="block" gap="tight">
                                <s-text variant="bodyMd">
                                  <s-text variant="subdued">Total: </s-text>
                                  <s-text variant="strong">{proAnalytics.customerSegments.total}</s-text>
                                </s-text>
                                <s-text variant="bodyMd">
                                  <s-text variant="subdued">First-Time: </s-text>
                                  <s-text variant="strong">{proAnalytics.customerSegments.firstTime}</s-text>
                                </s-text>
                                <s-text variant="bodyMd">
                                  <s-text variant="subdued">Repeat: </s-text>
                                  <s-text variant="strong">{proAnalytics.customerSegments.repeat}</s-text>
                                </s-text>
                                {proAnalytics.customerSegments.total > 0 && (
                                  <s-text variant="bodyMd">
                                    <s-text variant="subdued">Repeat Rate: </s-text>
                                    <s-text variant="strong">{((proAnalytics.customerSegments.repeat / proAnalytics.customerSegments.total) * 100).toFixed(1)}%</s-text>
                                  </s-text>
                                )}
                              </s-stack>
                            </s-stack>
                          </s-box>

                          {/* Sentiment Analysis */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <s-stack direction="block" gap="base">
                              <s-text variant="strong">Sentiment Analysis</s-text>
                              {proAnalytics.sentimentAnalysis.total > 0 ? (
                                <s-stack direction="block" gap="tight">
                                  <s-text variant="bodyMd">
                                    <s-text variant="subdued">Analyzed: </s-text>
                                    <s-text variant="strong">{proAnalytics.sentimentAnalysis.total}</s-text>
                                  </s-text>
                                  <s-text variant="bodyMd">
                                    <s-stack direction="inline" gap="tight" alignment="center">
                                      <s-badge tone="success">Positive</s-badge>
                                    {proAnalytics.sentimentAnalysis.positive} ({((proAnalytics.sentimentAnalysis.positive / proAnalytics.sentimentAnalysis.total) * 100).toFixed(1)}%)
                                    </s-stack>
                                  </s-text>
                                  <s-text variant="bodyMd">
                                    <s-stack direction="inline" gap="tight" alignment="center">
                                      <s-badge tone="subdued">Neutral</s-badge>
                                    {proAnalytics.sentimentAnalysis.neutral} ({((proAnalytics.sentimentAnalysis.neutral / proAnalytics.sentimentAnalysis.total) * 100).toFixed(1)}%)
                                    </s-stack>
                                  </s-text>
                                  <s-text variant="bodyMd">
                                    <s-stack direction="inline" gap="tight" alignment="center">
                                      <s-badge tone="critical">Negative</s-badge>
                                    {proAnalytics.sentimentAnalysis.negative} ({((proAnalytics.sentimentAnalysis.negative / proAnalytics.sentimentAnalysis.total) * 100).toFixed(1)}%)
                                    </s-stack>
                                  </s-text>
                                </s-stack>
                              ) : (
                                <s-text variant="subdued">No sentiment data available yet</s-text>
                              )}
                            </s-stack>
                          </s-box>

                          {/* Revenue Attribution */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <s-stack direction="block" gap="base">
                              <s-text variant="strong">Revenue Attribution</s-text>
                              <s-stack direction="block" gap="tight">
                                <s-text variant="headingMd">
                                  {formatCurrency(proAnalytics.revenueAttribution.total, proAnalytics.revenueAttribution.currency)}
                                </s-text>
                                <s-text variant="bodyMd">
                                  <s-text variant="subdued">From DMs: </s-text>
                                  <s-text variant="strong">{formatCurrency(proAnalytics.revenueAttribution.byChannel.dm, proAnalytics.revenueAttribution.currency)}</s-text>
                                </s-text>
                                <s-text variant="bodyMd">
                                  <s-text variant="subdued">From Comments: </s-text>
                                  <s-text variant="strong">{formatCurrency(proAnalytics.revenueAttribution.byChannel.comment, proAnalytics.revenueAttribution.currency)}</s-text>
                                </s-text>
                              </s-stack>
                            </s-stack>
                          </s-box>

                          {/* Follow-Up Performance */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <s-stack direction="block" gap="base">
                              <s-text variant="strong">Follow-Up Performance</s-text>
                              <s-stack direction="block" gap="base">
                                <div>
                                  <s-text variant="subdued">With Follow-Up</s-text>
                                  <s-stack direction="block" gap="tight">
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">Messages: </s-text>
                                      <s-text variant="strong">{proAnalytics.followUpPerformance.withFollowup.messages}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">CTR: </s-text>
                                      <s-text variant="strong">{proAnalytics.followUpPerformance.withFollowup.ctr.toFixed(1)}%</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">Revenue: </s-text>
                                      <s-text variant="strong">{formatCurrency(proAnalytics.followUpPerformance.withFollowup.revenue, proAnalytics.revenueAttribution.currency)}</s-text>
                                    </s-text>
                                  </s-stack>
                                </div>
                                <div className="srDividerTop">
                                  <s-text variant="subdued">Without Follow-Up</s-text>
                                  <s-stack direction="block" gap="tight">
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">Messages: </s-text>
                                      <s-text variant="strong">{proAnalytics.followUpPerformance.withoutFollowup.messages}</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
                                      <s-text variant="subdued">CTR: </s-text>
                                      <s-text variant="strong">{proAnalytics.followUpPerformance.withoutFollowup.ctr.toFixed(1)}%</s-text>
                                    </s-text>
                                    <s-text variant="bodyMd">
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
                    </s-stack>
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
            <s-stack direction="block" gap="base">
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-text variant="bodyMd" tone="subdued">
                  Track which orders came from Instagram DMs and comments via attribution links.
                </s-text>
              </s-box>

              {/* Filters Section */}
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-stack direction="block" gap="base">
                  <s-text variant="strong">Filters</s-text>
                <form onSubmit={handleFilterSubmit}>
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base">
                      <s-box padding="tight" border="base" borderRadius="base" className="srFlex1">
                      <s-stack direction="block" gap="tight">
                        <label htmlFor="channel">
                          <s-text variant="strong">Channel</s-text>
                        </label>
                        <select
                          id="channel"
                          name="channel"
                          className="srSelect"
                          defaultValue={filters.channel || ""}
                        >
                          <option value="">All Channels</option>
                          <option value="dm">DM</option>
                          <option value="comment">Comment</option>
                        </select>
                      </s-stack>
                    </s-box>

                    <s-box padding="tight" border="base" borderRadius="base" className="srFlex1">
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
                          className="srInput"
                        />
                      </s-stack>
                    </s-box>

                    <s-box padding="tight" border="base" borderRadius="base" className="srFlex1">
                      <s-stack direction="block" gap="tight">
                        <label htmlFor="start_date">
                          <s-text variant="strong">Start Date</s-text>
                        </label>
                        <input
                          type="date"
                          id="start_date"
                          name="start_date"
                          defaultValue={filters.startDate || ""}
                          className="srInput"
                        />
                      </s-stack>
                    </s-box>

                    <s-box padding="tight" border="base" borderRadius="base" className="srFlex1">
                      <s-stack direction="block" gap="tight">
                        <label htmlFor="end_date">
                          <s-text variant="strong">End Date</s-text>
                        </label>
                        <input
                          type="date"
                          id="end_date"
                          name="end_date"
                          defaultValue={filters.endDate || ""}
                          className="srInput"
                        />
                      </s-stack>
                    </s-box>

                    <s-box padding="tight" border="base" borderRadius="base" className="srFlex1">
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
                          className="srInput"
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
                <table className="srTable">
                  <thead>
                    <tr>
                      <th className="srTh srTextLeft">Order ID</th>
                      <th className="srTh srTextLeft">Amount</th>
                      <th className="srTh srTextLeft">Channel</th>
                      <th className="srTh srTextLeft">Link ID</th>
                      <th className="srTh srTextLeft">Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attributionRecords.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <s-text variant="bodyMd">{record.order_id || "—"}</s-text>
                        </td>
                        <td>
                          <s-text variant="bodyMd">{formatCurrency(record.amount, record.currency)}</s-text>
                        </td>
                        <td>
                          <s-badge tone={record.channel === "dm" ? "info" : record.channel === "comment" ? "success" : "subdued"}>
                            {record.channel || "—"}
                          </s-badge>
                        </td>
                        <td>
                          {record.link_id ? (
                            <s-link href={`/app/links/${record.link_id}`}>
                              <s-text variant="bodyMd" tone="info">
                                {record.link_id}
                              </s-text>
                            </s-link>
                          ) : (
                            <s-text variant="bodyMd" tone="subdued">—</s-text>
                          )}
                        </td>
                        <td>
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
          </s-stack>
          </s-section>

          {/* Message Log Section */}
          <PlanGate requiredPlan="GROWTH" feature="Message Log">
            <s-section heading="Message Log">
              <s-stack direction="block" gap="base">
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-text variant="bodyMd">
                    <s-text variant="subdued">Total Messages: </s-text>
                    <s-text variant="strong">{messageTotalCount}</s-text>
                  </s-text>
                </s-box>

                {/* Message Filters */}
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base" alignment="center">
                      <label className="srFieldLabel">
                        <s-text variant="subdued">Channel</s-text>
                        <select
                          value={messageFilters.channel || ""}
                          onChange={(e) => updateMessageFilter("message_channel", e.target.value || null)}
                          className="srSelect"
                        >
                          <option value="">All Channels</option>
                          <option value="dm">DM</option>
                          <option value="comment">Comment</option>
                        </select>
                      </label>

                      <label className="srFieldLabel">
                        <s-text variant="subdued">Start Date</s-text>
                        <input
                          type="date"
                          value={messageFilters.startDate || ""}
                          onChange={(e) => updateMessageFilter("message_start_date", e.target.value || null)}
                          className="srInput"
                        />
                      </label>

                      <label className="srFieldLabel">
                        <s-text variant="subdued">End Date</s-text>
                        <input
                          type="date"
                          value={messageFilters.endDate || ""}
                          onChange={(e) => updateMessageFilter("message_end_date", e.target.value || null)}
                          className="srInput"
                        />
                      </label>

                      <label className="srFieldLabel">
                        <s-text variant="subdued">Sort By</s-text>
                        <select
                          value={messageFilters.orderBy}
                          onChange={(e) => updateMessageFilter("message_order_by", e.target.value)}
                          className="srSelect"
                        >
                          <option value="created_at">Date</option>
                          <option value="channel">Channel</option>
                          <option value="text">Text</option>
                        </select>
                      </label>

                      <label className="srFieldLabel">
                        <s-text variant="subdued">Order</s-text>
                        <select
                          value={messageFilters.orderDirection}
                          onChange={(e) => updateMessageFilter("message_order_direction", e.target.value)}
                          className="srSelect"
                        >
                          <option value="desc">Newest First</option>
                          <option value="asc">Oldest First</option>
                        </select>
                      </label>

                      <s-button variant="secondary" onClick={clearMessageFilters}>
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
                            <s-stack direction="inline" gap="base" alignment="space-between">
                              <s-stack direction="inline" gap="base" alignment="center">
                                <s-badge tone={message.channel === "dm" ? "info" : "success"}>
                                  {message.channel.toUpperCase()}
                                </s-badge>
                                <s-text variant="subdued">{new Date(message.created_at).toLocaleString()}</s-text>
                                {message.external_id && (
                                  <s-text variant="subdued">ID: {message.external_id.substring(0, 20)}...</s-text>
                                )}
                              </s-stack>
                              {message.from_user_id && (
                                <s-text variant="subdued">From: {message.from_user_id}</s-text>
                              )}
                            </s-stack>

                            {/* Badges for intent, sentiment, and AI response */}
                            <s-stack direction="inline" gap="base" alignment="center">
                              {message.ai_responded ? (
                                <s-badge tone="success">AI Responded</s-badge>
                              ) : (
                                <s-badge tone="subdued">No Response</s-badge>
                              )}
                              {message.ai_intent && (
                                <s-badge tone="info">
                                  Intent: {message.ai_intent}
                                  {message.ai_confidence && ` (${(message.ai_confidence * 100).toFixed(0)}%)`}
                                </s-badge>
                              )}
                              {message.sentiment && (
                                <s-badge
                                  tone={
                                    message.sentiment === "positive"
                                      ? "success"
                                      : message.sentiment === "negative"
                                        ? "critical"
                                        : "subdued"
                                  }
                                >
                                  {message.sentiment}
                                </s-badge>
                              )}
                            </s-stack>

                            <s-button
                              variant="plain"
                              size="small"
                              onClick={() => toggleMessageExpanded(message.id)}
                            >
                              {isExpanded ? "Hide Conversation" : "Show Conversation"}
                            </s-button>

                            {/* Collapsible Conversation */}
                            {isExpanded && (
                              <s-stack direction="block" gap="base">
                                {/* Customer Message */}
                                <s-box padding="tight" borderWidth="base" borderRadius="base" background="base">
                                  <s-stack direction="block" gap="tight">
                                    <s-text variant="strong">Customer Message:</s-text>
                                    {message.text ? (
                                      <s-paragraph>
                                        <s-text>{message.text}</s-text>
                                      </s-paragraph>
                                    ) : (
                                      <s-text variant="subdued">No message text</s-text>
                                    )}
                                  </s-stack>
                                </s-box>

                                {/* AI Response - only show if AI responded */}
                                {message.ai_responded && (
                                  <s-box padding="tight" borderWidth="base" borderRadius="base" background="base">
                                    <s-stack direction="block" gap="tight">
                                      <s-stack direction="inline" gap="tight" alignment="center">
                                        <s-text variant="strong">AI Response:</s-text>
                                        {message.ai_response_sent_at && (
                                          <s-text variant="subdued">
                                            ({new Date(message.ai_response_sent_at).toLocaleString()})
                                          </s-text>
                                        )}
                                      </s-stack>
                                      {message.ai_response_text ? (
                                        <s-paragraph>
                                          <s-text className="srPreWrap">{message.ai_response_text}</s-text>
                                        </s-paragraph>
                                      ) : (
                                        <s-paragraph>
                                          <s-text variant="subdued" className="srItalic">
                                            AI sent a checkout link
                                          </s-text>
                                        </s-paragraph>
                                      )}
                                      {message.ai_response_link_id && (
                                        <s-link href={`/app/links/${message.ai_response_link_id}`}>
                                          <s-text variant="bodyMd" tone="info">
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
                  <s-stack direction="inline" gap="base" alignment="center">
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
              </s-stack>
            </s-section>
          </PlanGate>
      </s-page>
    );
  }

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
  }
  
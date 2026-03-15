import { useState } from "react";
import { useOutletContext, useRouteError, useLoaderData, useSearchParams, useSubmit, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getShopWithPlan } from "../lib/loader-helpers.server";
import { PlanGate, usePlanAccess } from "../components/PlanGate";
import { getAttributionRecords, getMessages, getMessageCount, getAnalytics, getProAnalytics, getProductMappings } from "../lib/db.server";
import { getMetaAuthWithRefresh, getInstagramMedia } from "../lib/meta.server";
import supabase from "../lib/supabase.server";

export const loader = async ({ request }) => {
  const { shop, plan } = await getShopWithPlan(request);

  const url = new URL(request.url);
  const channel = url.searchParams.get("channel") || null;
  const orderId = url.searchParams.get("order_id") || null;
  const startDate = url.searchParams.get("start_date") || null;
  const endDate = url.searchParams.get("end_date") || null;
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  const messageChannel = url.searchParams.get("message_channel") || null;
  const messagePage = parseInt(url.searchParams.get("message_page") || "1", 10);
  const messageLimit = 50;
  const messageOffset = (messagePage - 1) * messageLimit;
  const messageStartDate = url.searchParams.get("message_start_date") || null;
  const messageEndDate = url.searchParams.get("message_end_date") || null;
  const messageOrderBy = url.searchParams.get("message_order_by") || "created_at";
  const messageOrderDirection = url.searchParams.get("message_order_direction") || "desc";

  const analyticsStartDate = url.searchParams.get("analytics_start_date") || null;
  const analyticsEndDate = url.searchParams.get("analytics_end_date") || null;

  // Pro-only: post filter
  const postFilterId = url.searchParams.get("post_id") || null;

  // For Pro users, load Instagram media + product mappings for the post filter
  let mediaPosts = [];
  let productMappings = [];
  if (plan?.name === "PRO") {
    const metaAuth = await getMetaAuthWithRefresh(shop.id).catch(() => null);
    const [mediaResult, mappingsResult] = await Promise.all([
      metaAuth?.ig_business_id || metaAuth?.auth_type === "instagram"
        ? getInstagramMedia(metaAuth.ig_business_id || "", shop.id, { limit: 25 }).catch(() => null)
        : Promise.resolve(null),
      getProductMappings(shop.id),
    ]);
    mediaPosts = mediaResult?.data || [];
    productMappings = mappingsResult || [];
  }

  // Resolve post_id → product_id for query filtering, and pre-fetch scoped IDs
  let postProductId = null;
  let postFilterMessageIds = null;
  let postFilterLinkIds = null;
  if (postFilterId && plan?.name === "PRO") {
    const mapping = productMappings.find(m => m.ig_media_id === postFilterId);
    if (mapping) {
      postProductId = mapping.product_id;
      const { data: scopedLinks } = await supabase
        .from("links_sent")
        .select("message_id, link_id")
        .eq("shop_id", shop.id)
        .eq("product_id", postProductId);
      postFilterMessageIds = [...new Set((scopedLinks || []).map(l => l.message_id).filter(Boolean))];
      postFilterLinkIds = [...new Set((scopedLinks || []).map(l => l.link_id).filter(Boolean))];
    }
  }

  const analyticsDateRange = {
    startDate: analyticsStartDate,
    endDate: analyticsEndDate,
    productId: postProductId,
  };
  const [
    attributionRecords,
    messages,
    messageTotalCount,
    analytics,
    proAnalytics,
  ] = await Promise.all([
    getAttributionRecords(shop.id, { channel, orderId, startDate, endDate, limit, linkIds: postFilterLinkIds }),
    getMessages(shop.id, {
      channel: messageChannel,
      limit: messageLimit,
      offset: messageOffset,
      startDate: messageStartDate,
      endDate: messageEndDate,
      orderBy: messageOrderBy,
      orderDirection: messageOrderDirection,
      messageIds: postFilterMessageIds,
    }),
    getMessageCount(shop.id, {
      channel: messageChannel,
      startDate: messageStartDate,
      endDate: messageEndDate,
      messageIds: postFilterMessageIds,
    }),
    plan?.name ? getAnalytics(shop.id, plan.name, analyticsDateRange) : Promise.resolve(null),
    plan?.name === "PRO" ? getProAnalytics(shop.id, analyticsDateRange) : Promise.resolve(null),
  ]);

  const messageTotalPages = Math.ceil(messageTotalCount / messageLimit);

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
    mediaPosts,
    productMappings,
    postFilterId,
  };
};

export default function AnalyticsPage() {
  const { shop, plan } = useOutletContext() || {};
  const { hasAccess, isFree, isGrowth, isPro } = usePlanAccess();
  const { attributionRecords, filters, messages, messageTotalCount, messageTotalPages, messageCurrentPage, messageFilters, analytics, proAnalytics, analyticsFilters, mediaPosts, productMappings, postFilterId } = useLoaderData();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const navigate = useNavigate();
  const [expandedMessages, setExpandedMessages] = useState(new Set());

  // Build a set of mapped media IDs for the post picker
  const mappedMediaIds = new Set((productMappings || []).map(m => m.ig_media_id));

  const handlePostFilter = (mediaId) => {
    const params = new URLSearchParams(searchParams);
    if (mediaId) {
      params.set("post_id", mediaId);
    } else {
      params.delete("post_id");
    }
    params.delete("message_page");
    navigate(`/app/analytics?${params.toString()}`, { replace: true, preventScrollReset: true });
  };

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

          {/* Analytics Date Range Filter */}
          <s-section heading="Overview">
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
                <div className="srFilterRow">
                  <label className="srFieldLabel">
                    <span className="srGridTextSubdued">Start Date</span>
                    <input
                      type="date"
                      name="analytics_start_date"
                      defaultValue={analyticsFilters?.startDate || ""}
                      className="srInput"
                    />
                  </label>
                  <label className="srFieldLabel">
                    <span className="srGridTextSubdued">End Date</span>
                    <input
                      type="date"
                      name="analytics_end_date"
                      defaultValue={analyticsFilters?.endDate || ""}
                      className="srInput"
                    />
                  </label>
                  <div className="srFilterActions">
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
                  </div>
                </div>
              </form>
            </s-box>

            {/* Post Filter (Pro only) */}
            {isPro && mediaPosts.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="srVStack">
                  <div className="srHStackSpread">
                    <span className="srTextStrong">Filter by Post</span>
                    {postFilterId && (
                      <s-button variant="plain" size="small" onClick={() => handlePostFilter(null)}>Clear Post Filter</s-button>
                    )}
                  </div>
                  <div className="srPostPickerStrip">
                    {mediaPosts.filter(m => mappedMediaIds.has(m.id)).map((media) => {
                      const isActive = postFilterId === media.id;
                      const mapping = (productMappings || []).find(m => m.ig_media_id === media.id);
                      return (
                        <button
                          key={media.id}
                          className={`srPostPickerItem ${isActive ? "srPostPickerItemActive" : ""}`}
                          onClick={() => handlePostFilter(isActive ? null : media.id)}
                          type="button"
                        >
                          {(media.media_url || media.thumbnail_url) && (
                            <img
                              src={media.thumbnail_url || media.media_url}
                              alt={media.caption || "Post"}
                              className="srPostPickerImg"
                            />
                          )}
                          <span className="srPostPickerCaption">
                            {media.caption
                              ? (media.caption.length > 40 ? media.caption.slice(0, 40) + "…" : media.caption)
                              : mapping?.product_handle || "Post"}
                          </span>
                          {isActive && <span className="srPostPickerCheck">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  {postFilterId && (
                    <s-banner tone="info">
                      Showing analytics for the selected post only. <button className="srLinkBtn" onClick={() => handlePostFilter(null)}>Show all posts</button>
                    </s-banner>
                  )}
                </div>
              </div>
            )}
          </s-section>

          {/* Analytics - Progressive display based on plan tier */}
          <s-section>
            {analytics ? (
              <>
                {analytics.messagesReceived === 0 && analytics.linksSent === 0 ? (
                  <s-box padding="base" borderWidth="base" borderRadius="base">
                    <div className="srCardPad srVStackTight">
                      <span className="srTextStrong">No data yet</span>
                      <span className="srTextSubdued">
                        Once you start receiving messages and sending links, your analytics will appear here.
                      </span>
                    </div>
                  </s-box>
                ) : (
                  <div className="srVStack">
                    {/* Free Tier Metrics */}
                    <div className="srKpiGrid">
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <div className="srCardPad srVStackTight">
                          <span className="srTextSubdued">Messages Received</span>
                          <span className="srHeadingLg">
                            {analytics.messagesReceived || 0}
                            {plan?.name === "FREE" && (
                              <span className="srTextSubdued" style={{ fontSize: 14, fontWeight: 400 }}> / {plan?.cap || 25}</span>
                            )}
                          </span>
                        </div>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <div className="srCardPad srVStackTight">
                          <span className="srTextSubdued">Links Sent</span>
                          <span className="srHeadingLg">{analytics.linksSent || 0}</span>
                        </div>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <div className="srCardPad srVStackTight">
                          <span className="srTextSubdued">Clicks</span>
                          <span className="srHeadingLg">{analytics.clicks || 0}</span>
                        </div>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <div className="srCardPad srVStackTight">
                          <span className="srTextSubdued">Click-Through Rate</span>
                          <span className="srHeadingLg">{analytics.ctr ? `${analytics.ctr.toFixed(1)}%` : "0%"}</span>
                        </div>
                      </s-box>
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <div className="srCardPad srVStackTight">
                          <span className="srTextSubdued">Response Rate</span>
                          <span className="srHeadingLg">{analytics.responseRate ? `${analytics.responseRate.toFixed(1)}%` : "0%"}</span>
                        </div>
                      </s-box>
                    </div>

                    {analytics.topTriggerPhrases && analytics.topTriggerPhrases.length > 0 && (
                      <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                        <div className="srCardPad srVStack">
                          <span className="srTextStrong">Top Trigger Phrases</span>
                          <div className="srWrapRow">
                            {analytics.topTriggerPhrases.map((phrase, idx) => (
                              <s-badge key={idx} tone="info">
                                {phrase.intent} ({phrase.count})
                              </s-badge>
                            ))}
                          </div>
                        </div>
                      </s-box>
                    )}

                    {/* Growth Tier: Channel Performance */}
                    <PlanGate requiredPlan="GROWTH" feature="Channel Performance Analytics">
                      {analytics.channelPerformance ? (
                        <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                          <div className="srCardPad srVStack">
                            <span className="srTextStrong">Channel Performance</span>
                            <div className="srGridAuto250">
                              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                <div className="srCardPad srVStack">
                                  <span className="srTextStrong">Direct Messages</span>
                                  <div className="srVStackTight">
                                    <span className="srStatRow"><span className="srStatLabel">Sent: </span><span className="srStatValue">{analytics.channelPerformance.dm.sent}</span></span>
                                    <span className="srStatRow"><span className="srStatLabel">Responded: </span><span className="srStatValue">{analytics.channelPerformance.dm.responded}</span></span>
                                    <span className="srStatRow"><span className="srStatLabel">Clicks: </span><span className="srStatValue">{analytics.channelPerformance.dm.clicks}</span></span>
                                    {analytics.channelPerformance.dm.sent > 0 && (
                                      <span className="srStatRow"><span className="srStatLabel">CTR: </span><span className="srStatValue">{((analytics.channelPerformance.dm.clicks / analytics.channelPerformance.dm.sent) * 100).toFixed(1)}%</span></span>
                                    )}
                                  </div>
                                </div>
                              </s-box>
                              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                                <div className="srCardPad srVStack">
                                  <span className="srTextStrong">Comments</span>
                                  <div className="srVStackTight">
                                    <span className="srStatRow"><span className="srStatLabel">Sent: </span><span className="srStatValue">{analytics.channelPerformance.comment.sent}</span></span>
                                    <span className="srStatRow"><span className="srStatLabel">Responded: </span><span className="srStatValue">{analytics.channelPerformance.comment.responded}</span></span>
                                    <span className="srStatRow"><span className="srStatLabel">Clicks: </span><span className="srStatValue">{analytics.channelPerformance.comment.clicks}</span></span>
                                    {analytics.channelPerformance.comment.sent > 0 && (
                                      <span className="srStatRow"><span className="srStatLabel">CTR: </span><span className="srStatValue">{((analytics.channelPerformance.comment.clicks / analytics.channelPerformance.comment.sent) * 100).toFixed(1)}%</span></span>
                                    )}
                                  </div>
                                </div>
                              </s-box>
                            </div>
                          </div>
                        </s-box>
                      ) : null}
                    </PlanGate>

                    {/* Pro Tier Metrics */}
                    <PlanGate requiredPlan="PRO" feature="Pro Analytics">
                      {proAnalytics ? (
                        <div className="srGridAuto280">
                          {/* Customer Segments */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <div className="srCardPad srVStack">
                              <span className="srTextStrong">Customer Segments</span>
                              <div className="srVStackTight">
                                <span className="srStatRow"><span className="srStatLabel">Total: </span><span className="srStatValue">{proAnalytics.customerSegments.total}</span></span>
                                <span className="srStatRow"><span className="srStatLabel">First-Time: </span><span className="srStatValue">{proAnalytics.customerSegments.firstTime}</span></span>
                                <span className="srStatRow"><span className="srStatLabel">Repeat: </span><span className="srStatValue">{proAnalytics.customerSegments.repeat}</span></span>
                                {proAnalytics.customerSegments.total > 0 && (
                                  <span className="srStatRow"><span className="srStatLabel">Repeat Rate: </span><span className="srStatValue">{((proAnalytics.customerSegments.repeat / proAnalytics.customerSegments.total) * 100).toFixed(1)}%</span></span>
                                )}
                              </div>
                            </div>
                          </s-box>

                          {/* Sentiment Analysis */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <div className="srCardPad srVStack">
                              <span className="srTextStrong">Sentiment Analysis</span>
                              {proAnalytics.sentimentAnalysis.total > 0 ? (
                                <div className="srVStackTight">
                                  <span className="srStatRow"><span className="srStatLabel">Analyzed: </span><span className="srStatValue">{proAnalytics.sentimentAnalysis.total}</span></span>
                                  <div className="srHStackTight">
                                    <s-badge tone="success">Positive</s-badge>
                                    <span className="srTextBody">{proAnalytics.sentimentAnalysis.positive} ({((proAnalytics.sentimentAnalysis.positive / proAnalytics.sentimentAnalysis.total) * 100).toFixed(1)}%)</span>
                                  </div>
                                  <div className="srHStackTight">
                                    <s-badge tone="subdued">Neutral</s-badge>
                                    <span className="srTextBody">{proAnalytics.sentimentAnalysis.neutral} ({((proAnalytics.sentimentAnalysis.neutral / proAnalytics.sentimentAnalysis.total) * 100).toFixed(1)}%)</span>
                                  </div>
                                  <div className="srHStackTight">
                                    <s-badge tone="critical">Negative</s-badge>
                                    <span className="srTextBody">{proAnalytics.sentimentAnalysis.negative} ({((proAnalytics.sentimentAnalysis.negative / proAnalytics.sentimentAnalysis.total) * 100).toFixed(1)}%)</span>
                                  </div>
                                </div>
                              ) : (
                                <span className="srTextSubdued">No sentiment data available yet</span>
                              )}
                            </div>
                          </s-box>

                          {/* Revenue Attribution */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <div className="srCardPad srVStack">
                              <span className="srTextStrong">Revenue Attribution</span>
                              <div className="srVStackTight">
                                <span className="srHeadingMd">{formatCurrency(proAnalytics.revenueAttribution.total, proAnalytics.revenueAttribution.currency)}</span>
                                <span className="srStatRow"><span className="srStatLabel">From DMs: </span><span className="srStatValue">{formatCurrency(proAnalytics.revenueAttribution.byChannel.dm, proAnalytics.revenueAttribution.currency)}</span></span>
                                <span className="srStatRow"><span className="srStatLabel">From Comments: </span><span className="srStatValue">{formatCurrency(proAnalytics.revenueAttribution.byChannel.comment, proAnalytics.revenueAttribution.currency)}</span></span>
                              </div>
                            </div>
                          </s-box>

                          {/* Follow-Up Performance */}
                          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
                            <div className="srCardPad srVStack">
                              <span className="srTextStrong">Follow-Up Performance</span>
                              <div className="srVStackTight">
                                <span className="srTextSubdued">With Follow-Up</span>
                                <span className="srStatRow"><span className="srStatLabel">Messages: </span><span className="srStatValue">{proAnalytics.followUpPerformance.withFollowup.messages}</span></span>
                                <span className="srStatRow"><span className="srStatLabel">CTR: </span><span className="srStatValue">{proAnalytics.followUpPerformance.withFollowup.ctr.toFixed(1)}%</span></span>
                                <span className="srStatRow"><span className="srStatLabel">Revenue: </span><span className="srStatValue">{formatCurrency(proAnalytics.followUpPerformance.withFollowup.revenue, proAnalytics.revenueAttribution.currency)}</span></span>
                              </div>
                              <div className="srDividerTop">
                                <div className="srVStackTight">
                                  <span className="srTextSubdued">Without Follow-Up</span>
                                  <span className="srStatRow"><span className="srStatLabel">Messages: </span><span className="srStatValue">{proAnalytics.followUpPerformance.withoutFollowup.messages}</span></span>
                                  <span className="srStatRow"><span className="srStatLabel">CTR: </span><span className="srStatValue">{proAnalytics.followUpPerformance.withoutFollowup.ctr.toFixed(1)}%</span></span>
                                  <span className="srStatRow"><span className="srStatLabel">Revenue: </span><span className="srStatValue">{formatCurrency(proAnalytics.followUpPerformance.withoutFollowup.revenue, proAnalytics.revenueAttribution.currency)}</span></span>
                                </div>
                              </div>
                            </div>
                          </s-box>
                        </div>
                      ) : null}
                    </PlanGate>
                  </div>
                )}
              </>
            ) : (
              <span className="srTextSubdued">Loading analytics...</span>
            )}
          </s-section>

          {/* Order Attribution (Growth+) */}
          <PlanGate requiredPlan="GROWTH" feature="Order Attribution">
          <s-section heading="Order Attribution">
            <div className="srVStack">
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <div className="srCardPad">
                  <span className="srTextSubdued">Track which orders came from Instagram DMs and comments via attribution links.</span>
                </div>
              </s-box>

              {/* Filters */}
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <div className="srCardPad srVStack">
                  <span className="srTextStrong">Filters</span>
                  <form onSubmit={handleFilterSubmit}>
                    <div className="srVStack">
                      <div className="srFilterRow">
                        <label className="srFieldLabel srFlex1">
                          <span className="srTextSubdued">Channel</span>
                          <select id="channel" name="channel" className="srSelect" defaultValue={filters.channel || ""}>
                            <option value="">All Channels</option>
                            <option value="dm">DM</option>
                            <option value="comment">Comment</option>
                          </select>
                        </label>
                        <label className="srFieldLabel srFlex1">
                          <span className="srTextSubdued">Order ID</span>
                          <input type="text" id="order_id" name="order_id" placeholder="e.g., 123456789" defaultValue={filters.orderId || ""} className="srInput" />
                        </label>
                        <label className="srFieldLabel srFlex1">
                          <span className="srTextSubdued">Start Date</span>
                          <input type="date" id="start_date" name="start_date" defaultValue={filters.startDate || ""} className="srInput" />
                        </label>
                        <label className="srFieldLabel srFlex1">
                          <span className="srTextSubdued">End Date</span>
                          <input type="date" id="end_date" name="end_date" defaultValue={filters.endDate || ""} className="srInput" />
                        </label>
                        <label className="srFieldLabel">
                          <span className="srTextSubdued">Limit</span>
                          <input type="number" id="limit" name="limit" min="1" max="200" defaultValue={filters.limit || 50} className="srInput" style={{ width: 80 }} />
                        </label>
                      </div>
                      <div className="srFilterActions">
                        <s-button type="submit" variant="primary">Apply Filters</s-button>
                        <s-button type="button" variant="secondary" onClick={clearFilters}>Clear Filters</s-button>
                      </div>
                    </div>
                  </form>
                </div>
              </s-box>

              {/* Attribution Records Table */}
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <div className="srCardPad srVStack">
                  <span className="srTextStrong">Attribution Records ({attributionRecords.length})</span>
                  {attributionRecords.length === 0 ? (
                    <span className="srTextSubdued">No attribution records found.</span>
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
                            <td><span className="srTextBody">{record.order_id || "—"}</span></td>
                            <td><span className="srTextBody">{formatCurrency(record.amount, record.currency)}</span></td>
                            <td>
                              <s-badge tone={record.channel === "dm" ? "info" : record.channel === "comment" ? "success" : "subdued"}>
                                {record.channel || "—"}
                              </s-badge>
                            </td>
                            <td><span className="srTextBody">{record.link_id || "—"}</span></td>
                            <td><span className="srTextSubdued">{formatDate(record.created_at)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </s-box>
            </div>
          </s-section>
          </PlanGate>

          {/* Message Log */}
          <PlanGate requiredPlan="GROWTH" feature="Message Log">
            <s-section heading="Message Log">
              <div className="srVStack">
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <div className="srCardPad">
                    <span className="srStatRow"><span className="srStatLabel">Total Messages: </span><span className="srStatValue">{messageTotalCount}</span></span>
                  </div>
                </s-box>

                {/* Message Filters */}
                <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                  <div className="srCardPad">
                    <div className="srFilterRow">
                      <label className="srFieldLabel">
                        <span className="srTextSubdued">Channel</span>
                        <select value={messageFilters.channel || ""} onChange={(e) => updateMessageFilter("message_channel", e.target.value || null)} className="srSelect">
                          <option value="">All Channels</option>
                          <option value="dm">DM</option>
                          <option value="comment">Comment</option>
                        </select>
                      </label>
                      <label className="srFieldLabel">
                        <span className="srTextSubdued">Start Date</span>
                        <input type="date" value={messageFilters.startDate || ""} onChange={(e) => updateMessageFilter("message_start_date", e.target.value || null)} className="srInput" />
                      </label>
                      <label className="srFieldLabel">
                        <span className="srTextSubdued">End Date</span>
                        <input type="date" value={messageFilters.endDate || ""} onChange={(e) => updateMessageFilter("message_end_date", e.target.value || null)} className="srInput" />
                      </label>
                      <label className="srFieldLabel">
                        <span className="srTextSubdued">Sort By</span>
                        <select value={messageFilters.orderBy} onChange={(e) => updateMessageFilter("message_order_by", e.target.value)} className="srSelect">
                          <option value="created_at">Date</option>
                          <option value="channel">Channel</option>
                          <option value="text">Text</option>
                        </select>
                      </label>
                      <label className="srFieldLabel">
                        <span className="srTextSubdued">Order</span>
                        <select value={messageFilters.orderDirection} onChange={(e) => updateMessageFilter("message_order_direction", e.target.value)} className="srSelect">
                          <option value="desc">Newest First</option>
                          <option value="asc">Oldest First</option>
                        </select>
                      </label>
                      <div className="srFilterActions">
                        <s-button variant="secondary" onClick={clearMessageFilters}>Clear Filters</s-button>
                      </div>
                    </div>
                  </div>
                </s-box>

                {/* Messages List */}
                {messages.length === 0 ? (
                  <span className="srTextSubdued">No messages found.</span>
                ) : (
                  <div className="srVStack">
                    {messages.map((message) => {
                      const isExpanded = expandedMessages.has(message.id);
                      return (
                        <div key={message.id} className="srMsgCard">
                          <div className="srVStack">
                            {/* Header */}
                            <div className="srHStackSpread">
                              <div className="srHStackTight">
                                <s-badge tone={message.channel === "dm" ? "info" : "success"}>
                                  {message.channel.toUpperCase()}
                                </s-badge>
                                <span className="srTextSubdued">{new Date(message.created_at).toLocaleString()}</span>
                                {message.external_id && (
                                  <span className="srTextSubdued">ID: {message.external_id.substring(0, 20)}...</span>
                                )}
                              </div>
                              {message.from_user_id && (
                                <span className="srTextSubdued">From: {message.from_user_id}</span>
                              )}
                            </div>

                            {/* Badges */}
                            <div className="srHStackTight">
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
                                <s-badge tone={message.sentiment === "positive" ? "success" : message.sentiment === "negative" ? "critical" : "subdued"}>
                                  {message.sentiment}
                                </s-badge>
                              )}
                            </div>

                            <s-button variant="plain" size="small" onClick={() => toggleMessageExpanded(message.id)}>
                              {isExpanded ? "Hide Conversation" : "Show Conversation"}
                            </s-button>

                            {/* Collapsible Conversation */}
                            {isExpanded && (
                              <div className="srVStack">
                                {/* Customer Message */}
                                <div className="srMsgInner">
                                  <div className="srVStackTight">
                                    <span className="srTextStrong">Customer Message:</span>
                                    {message.text ? (
                                      <span className="srMsgText">{message.text}</span>
                                    ) : (
                                      <span className="srTextSubdued">No message text</span>
                                    )}
                                  </div>
                                </div>

                                {/* AI Response */}
                                {message.ai_responded && (
                                  <div className="srMsgInner">
                                    <div className="srVStackTight">
                                      <div className="srHStackTight">
                                        <span className="srTextStrong">AI Response:</span>
                                        {message.ai_response_sent_at && (
                                          <span className="srTextSubdued">({new Date(message.ai_response_sent_at).toLocaleString()})</span>
                                        )}
                                      </div>
                                      {message.ai_response_text ? (
                                        <span className="srMsgText">{message.ai_response_text}</span>
                                      ) : (
                                        <span className="srTextSubdued srItalic">AI sent a checkout link</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pagination */}
                {messageTotalPages > 1 && (
                  <div className="srPaginationRow">
                    <s-button variant="secondary" disabled={messageCurrentPage === 1} onClick={() => goToMessagePage(messageCurrentPage - 1)}>
                      Previous
                    </s-button>
                    <span className="srTextSubdued">Page {messageCurrentPage} of {messageTotalPages}</span>
                    <s-button variant="secondary" disabled={messageCurrentPage === messageTotalPages} onClick={() => goToMessagePage(messageCurrentPage + 1)}>
                      Next
                    </s-button>
                  </div>
                )}
              </div>
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
  
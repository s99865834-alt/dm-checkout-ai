import { useState } from "react";
import { useFetcher } from "react-router";
import { INSIGHTS_MIN_MESSAGES, INSIGHTS_WINDOW_DAYS } from "../lib/insights";

const FLAG_BADGE = {
  selling: { tone: "success", text: "Selling" },
  clicks_no_sales: { tone: "warning", text: "Opened, no sales" },
  asked_no_clicks: { tone: "critical", text: "Link never opened" },
};

const TOPICS_SHOWN = 4;

const ACTION_LABEL = { content: "Post idea", store: "Store fix", app: "App setting" };

function formatDay(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pickQuote(ids, messagesById) {
  const live = ids.map((id) => messagesById[id]).filter((m) => m?.text);
  return live.find((m) => m.text.length >= 12 && m.text.length <= 90) || live[0] || null;
}

// One line per topic plus one quote; everything else waits behind a click.
function Topic({ topic, messagesById }) {
  const [open, setOpen] = useState(false);
  const quote = pickQuote(topic.messageIds || [], messagesById);
  const all = (topic.messageIds || []).map((id) => messagesById[id]).filter(Boolean);
  return (
    <div className="srInsightTopic">
      <button
        type="button"
        className="srInsightTopicHead"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={topic.summary || undefined}
      >
        <span className="srInsightTopicLabel">{topic.label}</span>
        {topic.kind === "complaint" && <s-badge tone="critical">Complaint</s-badge>}
        <span className="srInsightTopicCount">{topic.count}</span>
        <span className="srInsightChevron" aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {quote && !open && <span className="srInsightQuote">&ldquo;{quote.text}&rdquo;</span>}
      {open && (
        <div className="srInsightMsgs">
          {all.map((m) => (
            <div key={m.id} className="srInsightMsg">
              <span className="srInsightMsgMeta">
                {m.channel === "comment" ? "Comment" : "DM"} · {formatDay(m.created_at)}
              </span>
              <span>{m.text}</span>
            </div>
          ))}
          {topic.count > all.length && (
            <span className="srInsightMsgMeta">{`Showing ${all.length} of ${topic.count}`}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Topics({ topics, messagesById }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? topics : topics.slice(0, TOPICS_SHOWN);
  return (
    <div className="srVStackTight">
      <div className="srHStackSpread">
        <span className="srTextStrong">What customers are asking</span>
        <span className="srInsightMsgMeta">Messages</span>
      </div>
      <div className="srInsightTopics">
        {shown.map((t, i) => (
          <Topic key={i} topic={t} messagesById={messagesById} />
        ))}
      </div>
      {topics.length > TOPICS_SHOWN && (
        <button type="button" className="srLinkBtn" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show ${topics.length - TOPICS_SHOWN} more`}
        </button>
      )}
    </div>
  );
}

function Products({ products }) {
  if (!products?.length) return null;
  return (
    <div className="srVStack">
      <span className="srTextStrong">Products people ask about</span>
      <span className="srCardDesc">
        Conversations that got a link to each product, how many opened it, and orders from those links.
      </span>
      <div className="srInsightTable" role="table">
        <div className="srInsightRow srInsightHead" role="row">
          <span role="columnheader">Product</span>
          <span role="columnheader">Conversations</span>
          <span role="columnheader">Opened</span>
          <span role="columnheader">Orders</span>
          <span role="columnheader" />
        </div>
        {products.slice(0, 8).map((p) => {
          const badge = FLAG_BADGE[p.flag];
          return (
            <div key={p.productId} className="srInsightRow" role="row">
              <span role="cell" className="srTextBody">{p.title || "Unnamed product"}</span>
              <span role="cell">{p.messages}</span>
              <span role="cell">{p.clicked}</span>
              <span role="cell">{p.orders}</span>
              <span role="cell">{badge ? <s-badge tone={badge.tone}>{badge.text}</s-badge> : null}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Actions({ actions, topics }) {
  if (!actions?.length) return null;
  return (
    <div className="srVStack">
      <span className="srTextStrong">What to do next</span>
      {actions.map((a, i) => {
        const topic = a.topic !== null && a.topic !== undefined ? topics[a.topic] : null;
        return (
          <div key={i} className="srMsgInner">
            <div className="srVStackTight">
              <div className="srHStackTight">
                <s-badge tone="info">{ACTION_LABEL[a.kind] || "Idea"}</s-badge>
                <span className="srTextStrong">{a.title}</span>
              </div>
              {a.detail && <span className="srCardDesc">{a.detail}</span>}
              {topic && (
                <span className="srTextSubdued">
                  {`Based on: ${topic.label} (${topic.count} ${topic.count === 1 ? "message" : "messages"})`}
                </span>
              )}
              {!topic && a.basis && <span className="srTextSubdued">{a.basis}</span>}
              {a.cta && (
                <div>
                  <s-button href={a.cta.href} variant="secondary" size="slim">{a.cta.label}</s-button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pro: the weekly insights card. `actions` is the live "What to do next" list
 * from the loader (see liveInsightActions); without it the stored ones show.
 */
export function InsightsCard({ insight, messagesById, canRefresh, actions }) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data?.insightsError;
  const data = insight?.data || {};
  const nextSteps = actions ?? data.actions;

  const refreshButton = (label) => (
    <fetcher.Form method="post">
      <input type="hidden" name="action" value="refresh-insights" />
      <s-button
        type="submit"
        variant="secondary"
        size="slim"
        loading={busy || undefined}
        disabled={(!canRefresh && !busy) || undefined}
      >
        {label}
      </s-button>
    </fetcher.Form>
  );

  let body;
  if (!insight) {
    body = (
      <span className="srCardDesc">
        Your first summary is being prepared and usually appears within an hour. You can also build it now.
      </span>
    );
  } else if (insight.status === "not_enough") {
    body = (
      <span className="srCardDesc">
        Not enough conversations yet. Insights need at least {data.needed || INSIGHTS_MIN_MESSAGES} customer
        messages in the last {INSIGHTS_WINDOW_DAYS} days, and you have {data.relevant ?? insight.message_count}.
        This updates on its own every week.
      </span>
    );
  } else {
    const topics = data.topics || [];
    body = (
      <div className="srVStack">
        {topics.length > 0 ? (
          <div className="srVStackTight">
            <Topics topics={topics} messagesById={messagesById || {}} />
            {data.sampled > 0 && data.sampled < data.relevant && (
              <span className="srInsightMsgMeta">
                {`From your latest ${data.sampled} of ${data.relevant} customer messages.`}
              </span>
            )}
          </div>
        ) : (
          <span className="srCardDesc">
            {data.aiFailed
              ? "Topic grouping did not run this time. Product numbers below are current; try a refresh later."
              : "No clear topics stood out in your recent messages."}
          </span>
        )}
        <Products products={data.products} />
        <Actions actions={nextSteps} topics={topics} />
      </div>
    );
  }
  // Live suggestions don't wait for the weekly summary.
  const pendingSteps = insight?.status !== "ready" && nextSteps?.length ? nextSteps : null;

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
      <div className="srCardPad srVStack">
        <div className="srHStackSpread" style={{ flexWrap: "wrap", gap: 8 }}>
          <div className="srVStackTight">
            <span className="srHeadingMd">Customer insights</span>
            <span className="srTextSubdued">
              Last {INSIGHTS_WINDOW_DAYS} days
              {insight?.status === "ready" ? ` · ${data.relevant} customer messages` : ""}
              {insight?.generated_at ? ` · updated ${formatDay(insight.generated_at)}` : ""}
            </span>
          </div>
          <span title={canRefresh ? undefined : "Updates weekly. You can refresh by hand once a day."}>
            {refreshButton(insight ? "Refresh" : "Build now")}
          </span>
        </div>
        {error && <s-banner tone="critical">{error}</s-banner>}
        {body}
        {pendingSteps && <Actions actions={pendingSteps} topics={[]} />}
      </div>
    </s-box>
  );
}

/** Basic: what Pro would show, using this shop's real conversation count. */
export function InsightsTeaser({ conversations }) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
      <div className="srCardPad srVStack">
        <div className="srHStackTight">
          <span className="srHeadingMd">Customer insights</span>
          <s-badge tone="info">Pro</s-badge>
        </div>
        <span className="srCardDesc">
          Every week, Pro groups your Instagram DMs and comments into what customers ask about most, shows which
          products get questions but no sales, and suggests what to post or fix next. Pro also adds story replies,
          follow-ups, and per-post analytics.
          {conversations > 0
            ? ` You had ${conversations} conversations in the last ${INSIGHTS_WINDOW_DAYS} days to learn from.`
            : ""}
        </span>
        <div className="srInsightPreview" aria-hidden="true">
          <div className="srInsightPreviewBar" style={{ width: "72%" }} />
          <div className="srInsightPreviewBar" style={{ width: "54%" }} />
          <div className="srInsightPreviewBar" style={{ width: "38%" }} />
        </div>
        <div>
          <s-button href="/app/billing/select" variant="primary" size="slim">Upgrade to Pro</s-button>
        </div>
      </div>
    </s-box>
  );
}

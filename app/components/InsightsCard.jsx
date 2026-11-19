import { useState } from "react";
import { useFetcher } from "react-router";
import { INSIGHTS_MIN_MESSAGES, INSIGHTS_WINDOW_DAYS } from "../lib/insights";

const FLAG_BADGE = {
  selling: { tone: "success", text: "Selling" },
  clicks_no_sales: { tone: "warning", text: "Opened, no sales" },
  asked_no_clicks: { tone: "critical", text: "Link never opened" },
};

const KIND_BADGE = {
  complaint: { tone: "critical", text: "Complaint" },
  interest: { tone: "success", text: "Interest" },
  feedback: { tone: "info", text: "Feedback" },
  question: { tone: "info", text: "Question" },
};

const ACTION_LABEL = { content: "Post idea", store: "Store fix", app: "App setting" };

function formatDay(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function pickQuotes(ids, messagesById, n = 2) {
  const live = ids.map((id) => messagesById[id]).filter((m) => m?.text);
  const readable = live.filter((m) => m.text.length >= 8 && m.text.length <= 160);
  return (readable.length >= n ? readable : live).slice(0, n);
}

function Topic({ topic, messagesById }) {
  const [open, setOpen] = useState(false);
  const quotes = pickQuotes(topic.messageIds || [], messagesById);
  const all = (topic.messageIds || []).map((id) => messagesById[id]).filter(Boolean);
  const kind = KIND_BADGE[topic.kind] || KIND_BADGE.question;
  return (
    <div className="srMsgCard">
      <div className="srVStack">
        <div className="srHStackSpread">
          <span className="srTextStrong">{topic.label}</span>
          <div className="srHStackTight">
            <s-badge tone={kind.tone}>{kind.text}</s-badge>
            <s-badge>{`${topic.count} ${topic.count === 1 ? "message" : "messages"}`}</s-badge>
          </div>
        </div>
        {topic.summary && <span className="srCardDesc">{topic.summary}</span>}
        {quotes.map((m) => (
          <div key={m.id} className="srMsgInner">
            <span className="srMsgText">&ldquo;{m.text}&rdquo;</span>
          </div>
        ))}
        {all.length > quotes.length && (
          <button type="button" className="srLinkBtn" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide messages" : `Show all ${all.length} messages`}
          </button>
        )}
        {open && (
          <div className="srVStackTight">
            {all.map((m) => (
              <div key={m.id} className="srMsgInner">
                <span className="srTextSubdued">
                  {m.from_username ? `@${m.from_username}` : "Customer"} · {m.channel === "comment" ? "Comment" : "DM"} · {formatDay(m.created_at)}
                </span>
                <span className="srMsgText" style={{ display: "block" }}>{m.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
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
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Pro: the weekly insights card. */
export function InsightsCard({ insight, messagesById, canRefresh }) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const error = fetcher.data?.insightsError;
  const data = insight?.data || {};

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
          <div className="srVStack">
            <span className="srTextStrong">What customers are asking</span>
            {topics.map((t, i) => (
              <Topic key={i} topic={t} messagesById={messagesById || {}} />
            ))}
            {data.sampled > 0 && data.sampled < data.relevant && (
              <span className="srTextSubdued">
                Topics are grouped from your latest {data.sampled} of {data.relevant} customer messages.
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
        <Actions actions={data.actions} topics={topics} />
      </div>
    );
  }

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

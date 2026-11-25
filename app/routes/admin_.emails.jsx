import { useMemo, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { getAdminSession, isAdminAuthConfigured } from "../lib/admin-auth.server";
import { buildWeeklyEmails, sendTestEmail, weeklyEmailEnabled } from "../lib/weekly-email.server";
import { buildWelcomeEmail, sendWelcomeTest, welcomeEmailEnabled } from "../lib/welcome-email.server";
import {
  buildMilestoneEmails,
  milestoneEmailEnabled,
  sampleMilestoneEmail,
  sendMilestoneTest,
} from "../lib/milestone-email.server";
import { postmarkConfigured } from "../lib/postmark.server";

const WELCOME_ID = "welcome";
const MILESTONE_ID = "milestone";

export const action = async ({ request }) => {
  if (!isAdminAuthConfigured() || !getAdminSession(request)) return { ok: false, error: "Sign in at /admin first" };
  const form = await request.formData();
  const shopId = String(form.get("shopId") || "");
  if (shopId === WELCOME_ID) return sendWelcomeTest();
  if (shopId === MILESTONE_ID) return sendMilestoneTest();
  if (shopId.startsWith(`${MILESTONE_ID}:`)) return sendMilestoneTest(shopId.slice(MILESTONE_ID.length + 1));
  return sendTestEmail(shopId);
};

export const meta = () => [{ title: "Weekly email preview" }, { name: "robots", content: "noindex" }];

// Preview only: builds this week's emails without sending or logging them.
export const loader = async ({ request }) => {
  if (!isAdminAuthConfigured() || !getAdminSession(request)) return { authenticated: false };
  const [{ weekStart, items }, milestones] = await Promise.all([
    buildWeeklyEmails(),
    buildMilestoneEmails().catch(() => []),
  ]);
  const sample = sampleMilestoneEmail();
  const milestoneRows = [
    {
      id: MILESTONE_ID,
      domain: "Sent once, when the AI has answered 10 questions",
      storeName: "First 10 answered (sample)",
      recipient: "the store owner",
      send: true,
      kind: "first 10 answered",
      extras: [],
      reason: null,
      subject: sample.subject,
      preheader: sample.preheader,
      html: sample.html,
      text: sample.text,
    },
    ...milestones.map(({ shop, facts, decision, email }) => ({
      id: `${MILESTONE_ID}:${shop.id}`,
      domain: shop.shopify_domain,
      storeName: facts?.storeName || shop.shopify_domain,
      recipient: facts?.email || null,
      send: decision.send,
      kind: "first 10 answered",
      extras: [],
      reason: decision.reason || null,
      subject: email?.subject || null,
      preheader: email?.preheader || null,
      html: email?.html || null,
      text: email?.text || null,
    })),
  ];
  const welcome = buildWelcomeEmail({ shopDomain: "your-store.myshopify.com", storeName: "Your Store" });
  const welcomeRow = {
    id: WELCOME_ID,
    domain: "Sent when a store installs",
    storeName: "Welcome email",
    recipient: "the store owner",
    send: true,
    kind: "welcome",
    extras: [],
    reason: null,
    subject: welcome.subject,
    preheader: welcome.preheader,
    html: welcome.html,
    text: welcome.text,
  };
  return {
    authenticated: true,
    canTest: postmarkConfigured(),
    sendingOn: weeklyEmailEnabled(),
    welcomeOn: welcomeEmailEnabled(),
    milestoneOn: milestoneEmailEnabled(),
    weekStart,
    welcomeRow,
    milestoneRows,
    items: items
      .map(({ shop, facts, decision, email }) => ({
        id: shop.id,
        domain: shop.shopify_domain,
        storeName: facts?.storeName || shop.shopify_domain,
        recipient: facts?.email || null,
        send: decision.send,
        kind: decision.kind || null,
        extras: decision.extras || [],
        reason: decision.reason || null,
        subject: email?.subject || null,
        preheader: email?.preheader || null,
        html: email?.html || null,
        text: email?.text || null,
      }))
      .sort((a, b) => Number(b.send) - Number(a.send) || (a.kind || "").localeCompare(b.kind || "")),
  };
};

const cell = { padding: "8px 10px", borderBottom: "1px solid #eee", fontSize: 13, textAlign: "left", verticalAlign: "top" };

export default function WeeklyEmailPreview() {
  const data = useLoaderData();
  const testFetcher = useFetcher();
  const [selectedId, setSelectedId] = useState(null);
  const [showText, setShowText] = useState(false);

  const counts = useMemo(() => {
    const c = {};
    for (const item of data.items || []) {
      const key = item.send ? item.kind : "skipped";
      c[key] = (c[key] || 0) + 1;
    }
    return c;
  }, [data.items]);

  if (!data.authenticated) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui" }}>
        Sign in at <a href="/admin">/admin</a> first, then come back to this page.
      </div>
    );
  }

  const rows = [data.welcomeRow, ...(data.milestoneRows || []), ...data.items];
  const selected = rows.find((i) => i.id === selectedId) || data.items.find((i) => i.send) || data.welcomeRow;

  return (
    <div style={{ display: "flex", gap: 20, padding: 20, fontFamily: "system-ui", alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 50%", minWidth: 0 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>Weekly email preview, week of {data.weekStart}</h1>
        <p style={{ margin: "0 0 14px", color: "#666", fontSize: 13 }}>
          {data.sendingOn
            ? "Weekly sending is ON: these go out Tuesday from 15:00 UTC."
            : "Weekly sending is OFF. Nothing goes to merchants until WEEKLY_EMAIL_ENABLED=true."}{" "}
          {Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")}
          <br />
          {data.welcomeOn
            ? "Welcome email is ON: sent when a store installs."
            : "Welcome email is OFF until WELCOME_EMAIL_ENABLED=true."}
          <br />
          {data.milestoneOn
            ? "First 10 answered email is ON: checked hourly, sent once per store."
            : "First 10 answered email is OFF (it needs the weekly email on, and MILESTONE_EMAIL_ENABLED not set to false)."}
        </p>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={cell}>Store</th>
              <th style={cell}>Email</th>
              <th style={cell}>Subject or reason skipped</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr
                key={item.id}
                onClick={() => item.send && setSelectedId(item.id)}
                style={{
                  cursor: item.send ? "pointer" : "default",
                  background: selected?.id === item.id ? "#fcebf5" : "transparent",
                  color: item.send ? "#1a1a1a" : "#999",
                }}
              >
                <td style={cell}>
                  {item.storeName}
                  <div style={{ color: "#999", fontSize: 12 }}>{item.domain}</div>
                </td>
                <td style={cell}>
                  {item.send ? [item.kind, ...item.extras].join(" + ") : "skip"}
                  <div style={{ color: "#999", fontSize: 12 }}>{item.recipient || "no email"}</div>
                </td>
                <td style={cell}>{item.send ? item.subject : item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ flex: "1 1 50%", position: "sticky", top: 20 }}>
        {selected ? (
          <>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>To:</strong> {selected.recipient} <br />
              <strong>Subject:</strong> {selected.subject} <br />
              <strong>Preview text:</strong> {selected.preheader}{" "}
              <button type="button" onClick={() => setShowText((v) => !v)} style={{ marginLeft: 8 }}>
                {showText ? "Show HTML" : "Show plain text"}
              </button>
              {data.canTest && (
                <button
                  type="button"
                  style={{ marginLeft: 8 }}
                  disabled={testFetcher.state !== "idle"}
                  onClick={() => testFetcher.submit({ shopId: selected.id }, { method: "post" })}
                >
                  {testFetcher.state !== "idle" ? "Sending…" : "Send this to me"}
                </button>
              )}
              {testFetcher.data && (
                <span style={{ marginLeft: 8, color: testFetcher.data.ok ? "#0c5132" : "#8e0b21" }}>
                  {testFetcher.data.ok ? `Sent to ${testFetcher.data.to}` : testFetcher.data.error}
                </span>
              )}
            </div>
            {showText ? (
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, background: "#fafafa", padding: 14, border: "1px solid #eee" }}>{selected.text}</pre>
            ) : (
              <iframe title="Email preview" srcDoc={selected.html} style={{ width: "100%", height: "80vh", border: "1px solid #eee", borderRadius: 8 }} />
            )}
          </>
        ) : (
          <p style={{ color: "#666" }}>No store gets an email this week.</p>
        )}
      </div>
    </div>
  );
}

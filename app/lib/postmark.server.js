/**
 * Minimal Postmark client: batch send only. https://postmarkapp.com/developer/api/email-api
 */
const BATCH_URL = "https://api.postmarkapp.com/email/batch";
export const POSTMARK_BATCH_LIMIT = 500;

export function postmarkConfigured() {
  return Boolean(process.env.POSTMARK_SERVER_TOKEN && process.env.EMAIL_FROM);
}

/**
 * @param {{to: string, subject: string, html: string, text: string, unsubscribeUrl?: string, metadata?: object, stream?: string}[]} messages
 * @returns {Promise<{ok: boolean, messageId?: string, error?: string}[]>} one result per message, in order
 */
export async function sendBatch(messages) {
  const results = [];
  for (let i = 0; i < messages.length; i += POSTMARK_BATCH_LIMIT) {
    const chunk = messages.slice(i, i + POSTMARK_BATCH_LIMIT);
    const body = chunk.map((m) => ({
      From: process.env.EMAIL_FROM,
      To: m.to,
      ReplyTo: process.env.EMAIL_REPLY_TO || undefined,
      Subject: m.subject,
      HtmlBody: m.html,
      TextBody: m.text,
      MessageStream: m.stream || process.env.POSTMARK_STREAM || "broadcast",
      TrackOpens: true,
      TrackLinks: "None",
      Metadata: m.metadata || {},
      Headers: m.unsubscribeUrl
        ? [
            { Name: "List-Unsubscribe", Value: `<${m.unsubscribeUrl}>` },
            { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
          ]
        : [],
    }));
    try {
      const res = await fetch(BATCH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(json)) {
        const error = `Postmark ${res.status}: ${json?.Message || "batch rejected"}`;
        chunk.forEach(() => results.push({ ok: false, error }));
        continue;
      }
      json.forEach((r) =>
        results.push(r.ErrorCode === 0 ? { ok: true, messageId: r.MessageID } : { ok: false, error: `${r.ErrorCode}: ${r.Message}` })
      );
    } catch (err) {
      chunk.forEach(() => results.push({ ok: false, error: err?.message || String(err) }));
    }
  }
  return results;
}

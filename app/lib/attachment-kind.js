/**
 * Classifying the non-text payloads Instagram delivers in a DM.
 *
 * Instagram sends plenty of DMs with no text: a shared post, a heart, a photo,
 * an emoji reply to a story. The parser originally read `text` only, so all of
 * them were logged with a null body and abandoned, 76 real customer messages
 * across live stores including 41% of one merchant's DM volume.
 *
 * Lives here rather than in the webhook route so it can be tested directly,
 * which is how the ig_post bug below would have been caught.
 */

/**
 * A forwarded post is the highest-intent non-text payload there is: the
 * customer has put a product into the DM thread.
 *
 * Meta labels it `ig_post`, not `share`. Only `share` was recognised, and in
 * production that arrived exactly twice while `ig_post` arrived six times and
 * fell through to "unsupported", so the shared-post path was almost never
 * reached by the thing it was built for.
 *
 * `ig_reel` is deliberately NOT here. A reel shared with a product account is
 * high intent, but a reel shared into a conversation is banter, and the volume
 * is overwhelmingly the latter: of 82 reel shares, 75 were on one account
 * whose DMs are friends swapping videos, and only 3 of those sat in a thread
 * the owner was handling, so the takeover pause would not have held the rest
 * back. They stay unanswered until there's a way to tell the two apart.
 */
export const SHARED_POST_TYPES = ["share", "ig_post"];

/**
 * The content_type for a set of attachments, or null when there are none.
 *
 * @param {Array<{type?: string}>|undefined} attachments
 * @returns {string|null}
 */
export function deriveAttachmentContentType(attachments) {
  const types = (attachments || []).map((a) => String(a?.type || "").toLowerCase());
  if (!types.length) return null;
  if (types.some((t) => SHARED_POST_TYPES.includes(t))) return "share";
  if (types.includes("story_mention")) return "story_mention";
  // Hearts arrive as stickers or like_heart depending on how they were sent;
  // both are the same warm signal as a compliment comment.
  if (types.some((t) => t === "like_heart" || t === "sticker")) return "heart";
  for (const t of ["image", "video", "audio", "file"]) {
    if (types.includes(t)) return t;
  }
  return "unsupported";
}

/**
 * How a message reads in the conversation history the model is given.
 *
 * Photos used to read as "(no text)", so the model could not tell a customer
 * had sent one. Tabcase, 25 Nov 2026: a customer sent two photos and asked
 * "are these two available?", and was asked to send a photo. Saying the model
 * cannot see them matters as much as saying they exist, or it answers as if
 * it had looked.
 *
 * @param {{text?: string, content_type?: string, attachment_meta?: {types?: string[]}}} message
 */
export function threadMessageText(message) {
  const text = String(message?.text || "").trim();
  const types = Array.isArray(message?.attachment_meta?.types)
    ? message.attachment_meta.types.map((t) => String(t).toLowerCase())
    : [];
  const photos = types.filter((t) => t === "image").length;
  const media = {
    image: photos > 1 ? `[sent ${photos} photos, which you cannot see]` : "[sent a photo, which you cannot see]",
    video: "[sent a video, which you cannot see]",
    audio: "[sent a voice message, which you cannot hear]",
    file: "[sent a file, which you cannot open]",
    share: "[shared an Instagram post]",
    heart: "[sent a heart]",
    story_mention: "[mentioned the store in their story]",
    story_reply: "[replied to the store's story]",
  }[message?.content_type] || (types.includes("ig_reel") ? "[shared a reel, which you cannot see]" : null);
  if (media && text) return `${media} ${text}`;
  return media || text || "(no text)";
}

/** Whether any of these messages carried a photo, video or file the model cannot see. */
export function customerSentMedia(messages) {
  return (messages || []).some(
    (m) =>
      ["image", "video", "file"].includes(m?.content_type) ||
      (Array.isArray(m?.attachment_meta?.types) && m.attachment_meta.types.some((t) => ["image", "video"].includes(t)))
  );
}

/**
 * Best-effort Instagram media id for a forwarded post. Payload urls are
 * lookaside CDN links that usually carry the media as `asset_id`, but Meta
 * does not guarantee it, so callers must handle null.
 *
 * Previously this only inspected `share` attachments, so for `ig_post` it
 * never looked at all: every one of them recorded a null media id, which is
 * what made them indistinguishable from an unmapped share.
 *
 * @param {Array<{type?: string, payload?: {url?: string}}>|undefined} attachments
 * @returns {string|null}
 */
export function extractSharedMediaId(attachments) {
  for (const a of attachments || []) {
    if (!SHARED_POST_TYPES.includes(String(a?.type || "").toLowerCase())) continue;
    const url = a?.payload?.url;
    if (!url) continue;
    const match = /[?&]asset_id=(\d+)/.exec(String(url));
    if (match) return match[1];
  }
  return null;
}

/**
 * The query parameter names on a forwarded post's url, for when the media id
 * couldn't be read.
 *
 * `asset_id` was verified on real `share` payloads, but never on `ig_post`,
 * because the extractor above skipped them. Rather than guess at other
 * parameter names, this reports which ones were actually present so the next
 * occurrence settles it. Returns names only: the url itself is a signed CDN
 * link that expires and isn't worth logging.
 *
 * @param {Array<{type?: string, payload?: {url?: string}}>|undefined} attachments
 * @returns {string[]}
 */
export function sharedPostUrlParamNames(attachments) {
  const names = new Set();
  for (const a of attachments || []) {
    if (!SHARED_POST_TYPES.includes(String(a?.type || "").toLowerCase())) continue;
    const url = a?.payload?.url;
    if (!url) continue;
    try {
      for (const key of new URL(String(url)).searchParams.keys()) names.add(key);
    } catch {
      // Not a parsable url; nothing to report.
    }
  }
  return [...names];
}

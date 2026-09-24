/**
 * Pick a Shopify collection from customer or caption text.
 *
 * Comment replies used to fall through to the homepage whenever a post was
 * unmapped, even when the caption named a real collection ("Aries Nail Polish",
 * "shop all of our crystal-infused shades"). The model then wrote "check out
 * the collection" and the link opened a landing page with no products on it.
 *
 * Matching is conservative: the collection title has to appear as a phrase in
 * the text. Longer titles win, so "Nail Polish" beats "Aries" when both show
 * up. Generic merchandising buckets (frontpage, sale, under-$X) are ignored
 * because they match too easily and dump the customer into the whole catalog.
 */

const GENERIC_HANDLES = new Set([
  "all",
  "frontpage",
  "home",
  "featured",
  "featured-collection",
  "featured-shop",
  "shop-by-category",
  "new-arrivals",
  "best-sellers",
  "trending-now",
  "sale",
  "last-chance",
  "last-call",
  "black-friday",
  "winter-sale",
]);

export function normalizeCollectionText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGenericBrowseCollection(collection) {
  const handle = String(collection?.handle || "").trim().toLowerCase();
  if (!handle) return true;
  if (GENERIC_HANDLES.has(handle)) return true;
  if (/^under-\d+$/.test(handle)) return true;
  if (/sale-\d{4}$/.test(handle)) return true;
  return false;
}

export function collectionHandleFromUrl(url) {
  if (!url) return null;
  try {
    const path = new URL(url).pathname;
    const match = path.match(/^\/collections\/([^/]+)/i);
    if (!match) return null;
    const handle = decodeURIComponent(match[1]).trim().toLowerCase();
    if (!handle || handle === "all") return null;
    return handle;
  } catch {
    return null;
  }
}

/**
 * Every collection whose title appears as a phrase in the text, longest first.
 *
 * @param {Array<{title?: string, handle?: string}>} collections
 * @param {string} text
 * @returns {Array<{title: string, handle: string, imageUrl?: string|null}>}
 */
export function findCollectionMatches(collections, text) {
  const hay = ` ${normalizeCollectionText(text)} `;
  if (hay.trim().length < 3 || !Array.isArray(collections) || collections.length === 0) {
    return [];
  }

  const matches = [];
  for (const collection of collections) {
    if (isGenericBrowseCollection(collection)) continue;
    const title = normalizeCollectionText(collection.title);
    if (title.length < 3) continue;
    if (!hay.includes(` ${title} `)) continue;
    matches.push({ collection, titleLength: title.length });
  }
  matches.sort((a, b) => b.titleLength - a.titleLength);
  return matches.map((m) => m.collection);
}

/**
 * @param {Array<{title?: string, handle?: string}>} collections
 * @param {string} text
 * @returns {{title: string, handle: string, imageUrl?: string|null}|null}
 */
export function pickCollectionMatch(collections, text) {
  return findCollectionMatches(collections, text)[0] || null;
}

/**
 * Looser lookup for a collection the customer named in their own words.
 * Phrase match first, then title-contains-query.
 *
 * @param {Array<{title?: string, handle?: string}>} collections
 * @param {string} query
 * @returns {Array<{title: string, handle: string, imageUrl?: string|null}>}
 */
export function searchCollections(collections, query) {
  const phrase = findCollectionMatches(collections, query);
  if (phrase.length) return phrase;
  const q = normalizeCollectionText(query);
  if (q.length < 3 || !Array.isArray(collections)) return [];
  return collections
    .filter((collection) => {
      if (isGenericBrowseCollection(collection)) return false;
      const title = normalizeCollectionText(collection.title);
      return title.includes(q) || q.includes(title);
    })
    .slice(0, 5);
}

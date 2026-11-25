/**
 * Matching a customer's words to a product variant.
 *
 * Deliberately dependency-free, like checkout-link-id.js: shopify-data.server
 * pulls in shopify.server, which builds the Prisma client and the Shopify app
 * at import time, so anything importing it needs real credentials. These are
 * pure string and array functions, and keeping them here means they can be
 * tested without env vars and without mocking half the app.
 */

/**
 * Values that are placeholders rather than a real choice a customer could make.
 */
const NON_CHOICE_VALUES =
  /^(default\s*title|one\s*size|os|osfa|one\s*size\s*fits\s*all|n\/a|default|free\s*size|freesize|universal|uni)$/i;

export const normalizeOptionText = (s) => (s || "").trim().toLowerCase();

const SIZE_ALIASES = new Map([
  ["xs", ["xs", "x-small", "x small", "extra small", "extra-small", "xsmall"]],
  ["s", ["s", "small", "sm"]],
  ["m", ["m", "medium", "med", "md"]],
  ["l", ["l", "large", "lg"]],
  ["xl", ["xl", "x-large", "x large", "extra large", "extra-large", "xlarge"]],
  ["xxl", ["xxl", "xx-large", "xx large", "2xl", "2x", "xxlarge"]],
  ["xxxl", ["xxxl", "xxx-large", "3xl", "3x", "xxxlarge"]],
  ["xxs", ["xxs", "xx-small", "xx small", "2xs", "xxsmall"]],
  ["0", ["0", "zero"]],
  ["00", ["00", "double zero"]],
  ["one size", ["one size", "os", "osfa", "one size fits all", "free size", "uni", "universal"]],
]);

export function expandSizeAliases(input) {
  const lower = normalizeOptionText(input);
  const canonical = [];
  for (const [, aliases] of SIZE_ALIASES) {
    if (aliases.includes(lower)) {
      canonical.push(...aliases);
    }
  }
  return canonical.length > 0 ? canonical : [lower];
}

/**
 * Whether `text` mentions `value` as a whole word.
 *
 * Word boundaries matter more than they look: a product with an "Ice"
 * colourway would otherwise match "nice", "price", and "service", so a
 * customer writing "what's the price?" would get silently checked out into a
 * variant they never picked. Digits count as word characters so "Ice 2" does
 * not match "Ice 20".
 */
export function mentionsOptionValue(text, value) {
  const v = normalizeOptionText(value);
  if (!v || NON_CHOICE_VALUES.test(v)) return false;
  // A customer answering "which size?" writes "small", not "S", so accept the
  // aliases the size resolver already knows about. Non-size values expand to
  // themselves, so this is a no-op for colours and scents.
  for (const candidate of new Set([v, ...expandSizeAliases(v)])) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text)) return true;
  }
  return false;
}

/**
 * Resolve a variant from a customer's free-text answer to "which one?".
 *
 * Matches the message against the option values this product actually has,
 * rather than looking for the words "colour" or "size". A customer answering
 * the question says "love the sunset", not "the colour sunset", and a
 * classifier reading that in isolation sees chatter: on Sep 1 a real customer
 * picked Sunset from five colours we had just listed and got no reply at all.
 *
 * Only values on this product can match, so this cannot invent a variant or
 * wander onto a different product.
 *
 * @param {Object} productOptions - { options: [{name, values}], variants }
 * @param {string} text - The customer's message
 * @param {string|null} preferredVariantId - Variant already in the conversation,
 *   used to settle the options the customer did not mention
 * @returns {{variant: Object, chosen: Array<{name: string, value: string}>}
 *   | {ambiguous: true, optionName: string, values: string[]} | null}
 */
export function resolveVariantByOptionValue(productOptions, text, preferredVariantId = null) {
  const haystack = normalizeOptionText(text);
  const options = productOptions?.options;
  const variants = productOptions?.variants?.nodes || productOptions?.variants || [];
  if (!haystack || !Array.isArray(options) || !variants.length) return null;

  const chosen = [];
  for (const opt of options) {
    if (!opt?.name || !Array.isArray(opt.values)) continue;
    const hits = opt.values
      .filter((v) => mentionsOptionValue(haystack, v))
      .sort((a, b) => normalizeOptionText(b).length - normalizeOptionText(a).length);
    if (hits.length === 0) continue;

    // Several values of the same option matched. That is only safe when the
    // longest contains the others ("Dawn" and "Dawn Patrol" for "dawn
    // patrol"). Otherwise the customer named two colours and guessing between
    // them is worse than asking.
    if (hits.length > 1) {
      const [longest, ...rest] = hits;
      const nested = rest.every((v) =>
        normalizeOptionText(longest).includes(normalizeOptionText(v))
      );
      if (!nested) return { ambiguous: true, optionName: opt.name, values: hits };
    }

    chosen.push({ name: opt.name, value: hits[0] });
  }

  if (chosen.length === 0) return null;

  const matchesChosen = (v) => {
    const opts = v.selectedOptions || [];
    return chosen.every((req) =>
      opts.some(
        (o) =>
          normalizeOptionText(o.name) === normalizeOptionText(req.name) &&
          normalizeOptionText(o.value) === normalizeOptionText(req.value)
      )
    );
  };

  const candidates = variants.filter(matchesChosen);
  if (candidates.length === 0) return null;

  // Keep whatever the customer did not mention as it already was, so answering
  // "sunset" on a size-M link does not silently move them to size S.
  const preferred = variants.find((v) => v.id === preferredVariantId);
  if (preferred && candidates.length > 1) {
    const keepRest = (v) => {
      const opts = v.selectedOptions || [];
      return (preferred.selectedOptions || [])
        .filter((o) => !chosen.some((c) => normalizeOptionText(c.name) === normalizeOptionText(o.name)))
        .every((req) =>
          opts.some(
            (o) =>
              normalizeOptionText(o.name) === normalizeOptionText(req.name) &&
              normalizeOptionText(o.value) === normalizeOptionText(req.value)
          )
        );
    };
    const best = candidates.find(keepRest);
    if (best) return { variant: best, chosen };
  }

  const inStock = candidates.find((v) => v.availableForSale !== false);
  return { variant: inStock || candidates[0], chosen };
}

/**
 * Whether our own last reply asked the customer to pick between options.
 *
 * Read against text we wrote ourselves, not customer text, so the phrasing is
 * predictable. Used to guarantee that an answer to our own question gets a
 * reply even when no option value matched it.
 */
export function askedCustomerToChoose(replyText) {
  const t = normalizeOptionText(replyText);
  if (!t) return false;
  // "Let me know which one you'd like!" is a question without a question mark.
  if (/let me know which/.test(t)) return true;
  if (!t.includes("?")) return false;
  return (
    /(which|what)\s+(one|colour|color|size|option|variant|style|scent|flavou?r|material|finish)/.test(t) ||
    /which (would|do) you/.test(t)
  );
}

const toAsciiDigits = (s) =>
  String(s || "")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/**
 * Codes the customer wrote that mix letters and digits: A16, M4, S24, 2XL,
 * SM-T500. Each names one exact thing, usually their device, model or size,
 * and the number inside it is part of that name.
 */
export function modelCodes(text) {
  const found = toAsciiDigits(text).match(/(?<![\p{L}\p{N}])[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*(?![\p{L}\p{N}])/gu) || [];
  return [
    ...new Set(
      found
        .filter((t) => /\p{L}/u.test(t) && /\p{N}/u.test(t) && t.length <= 12)
        .map((t) => t.toLowerCase().replace(/-/g, ""))
    ),
  ];
}

/**
 * Whether `text` names `code` whole. "iPad (A16)" and "A 16" do; "Design 16"
 * does not, because 16 alone is a different thing from A16.
 */
export function containsCode(text, code) {
  const tokens = toAsciiDigits(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const wanted = String(code || "").toLowerCase().replace(/-/g, "");
  if (!wanted) return false;
  return tokens.some((t, i) => t === wanted || `${t}${tokens[i + 1] || ""}` === wanted);
}

/**
 * Whether the customer has given a specific detail a reply could ask for
 * again: a number in any numeral system (a model, a size, a quantity) or one
 * of the option values of a product looked up for this reply. Links do not
 * count; a shared reel's URL is full of digits and says nothing.
 */
export function namesSpecificDetail(texts, optionValues = []) {
  const joined = toAsciiDigits((texts || []).filter(Boolean).join("\n")).replace(/https?:\/\/\S+/g, " ");
  if (/\d/.test(joined)) return true;
  return [...optionValues].some((v) => mentionsOptionValue(joined, v));
}

/** A catalog product's title and option names, for matching a code against. */
export function catalogText(product) {
  const options = (product?.variants?.nodes || []).map((v) => v?.title).filter(Boolean);
  return [product?.title || "", ...options].join(" ");
}

/**
 * Pick the catalog result that best matches what the customer named. Exact
 * title first, then a title containing it, then the search engine's own
 * ranking.
 *
 * A result only counts if it has every code they wrote. Catalog search
 * matches loosely, so "A16 ipad" ranked "iPad Case – Design 16" first on
 * Tabcase, and taking the top result sold the customer a design they never
 * asked about. With a code that no result has, there is no match.
 */
export function pickCatalogMatch(candidates, wanted) {
  if (!candidates?.length) return null;
  const codes = modelCodes(wanted);
  const fits = candidates.filter((p) => codes.every((c) => containsCode(catalogText(p), c)));
  if (!fits.length) return null;
  if (!wanted) return fits[0];
  const lower = String(wanted).toLowerCase();
  return (
    fits.find((p) => (p.title || "").toLowerCase() === lower) ||
    fits.find((p) => (p.title || "").toLowerCase().includes(lower)) ||
    fits[0]
  );
}

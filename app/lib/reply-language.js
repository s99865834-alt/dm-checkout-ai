/**
 * Which language a reply should be in.
 *
 * Emoji, hearts, and short noise are not a language, so they stay English.
 * That rule exists because hearts used to be treated as "mirror the
 * customer", the model guessed Spanish, and the English discount line made
 * one reply two languages.
 *
 * It was never meant to cover a real sentence. The markers below only name
 * seven Latin-script languages and the tokenizer only matches Latin letters,
 * so an Arabic message scored as "no language" and got the same forced-English
 * treatment as "🔥🔥🔥". State of Her is an Egyptian store: four of her
 * customers' first ten DMs were Arabic and all four were answered in English,
 * while the prompt told the model in capitals not to use any other language.
 *
 * So "no detectable language" is now split in two. Nothing we can read as a
 * word means noise, and noise stays English. Words we cannot place means a
 * customer writing in a language we do not enumerate, and the right reply is
 * their language, not ours. The model handles those perfectly well once we
 * stop forbidding it.
 *
 * A reply is still always one language, never two.
 */

export const REPLY_LANGUAGE_NAMES = {
  en: "English",
  "pt-BR": "Brazilian Portuguese",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  nl: "Dutch",
};

const STORE_LOCALE_PREFIX = {
  en: "en",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  nl: "nl",
  pt: "pt-BR",
};

const STRONG_MARKERS = {
  en: ["thanks", "thank", "please", "love", "need", "want", "this", "these", "amazing", "awesome"],
  es: ["gracias", "quiero", "quieres", "hola", "mucho", "amor", "verdad", "dónde", "cuánto", "también"],
  "pt-BR": ["obrigado", "obrigada", "você", "voce", "isso", "olá", "ola"],
  fr: ["merci", "bonjour", "vous", "ça", "veux"],
  de: ["danke", "bitte", "nicht", "haben"],
  it: ["grazie", "ciao", "vorrei", "questo", "questa"],
  nl: ["dankjewel", "dank", "graag", "alsjeblieft"],
};

const WORD_MARKERS = {
  en: ["the", "and", "you", "for", "with", "have", "just", "like", "products", "please"],
  es: ["el", "la", "los", "las", "que", "por", "para", "una", "este", "esta", "está"],
  "pt-BR": ["não", "nao", "para", "uma", "com", "está", "quero", "muito"],
  fr: ["les", "des", "une", "pour", "avec", "est", "pas", "cette"],
  de: ["ich", "und", "das", "die", "der", "ist", "ein", "eine", "wie"],
  it: ["il", "che", "per", "una", "con", "non", "sono"],
  nl: ["het", "een", "van", "niet", "voor", "met", "dit", "dat"],
};

export function normalizeStoreLocale(locale) {
  if (typeof locale !== "string" || !locale.trim()) return null;
  const raw = locale.trim().replace("_", "-");
  const lower = raw.toLowerCase();
  if (REPLY_LANGUAGE_NAMES[raw]) return raw;
  if (REPLY_LANGUAGE_NAMES[lower]) return lower;
  const prefix = lower.split("-")[0];
  return STORE_LOCALE_PREFIX[prefix] || null;
}

/**
 * Drop the parts of a message that say nothing about language: links, handles
 * and hashtags. Shared so tokenize and hasWords never disagree about what
 * counts as content.
 */
function stripNonLanguage(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/#\w+/g, " ");
}

function tokenize(text) {
  const stripped = stripNonLanguage(text).toLowerCase();
  return stripped.match(/[a-zà-öø-ÿãõáéíóúüñç]+/gi) || [];
}

/**
 * Does the message contain letters in ANY script?
 *
 * \p{L} is the whole Unicode letter category, so this sees Arabic, Hebrew,
 * Greek, Cyrillic, Thai, Japanese and Korean, none of which tokenize can.
 * Two letters is enough: "ok" is a word, where "🔥🔥🔥", "!!!" and "٣٦" are
 * not. Digits deliberately do not count, in any numeral system.
 */
export function hasWords(text) {
  const letters = stripNonLanguage(text).match(/\p{L}/gu) || [];
  return letters.length >= 2;
}

export function detectMessageLanguage(text) {
  const tokens = tokenize(text);
  const letters = tokens.join("");
  if (letters.length < 3) return null;

  const scores = {};
  const strong = {};
  for (const code of Object.keys(REPLY_LANGUAGE_NAMES)) {
    scores[code] = 0;
    strong[code] = 0;
    const tokenSet = new Set(tokens);
    for (const word of STRONG_MARKERS[code] || []) {
      if (tokenSet.has(word)) {
        scores[code] += 3;
        strong[code] += 1;
      }
    }
    for (const word of WORD_MARKERS[code] || []) {
      if (tokenSet.has(word)) scores[code] += 1;
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestCode, bestScore] = ranked[0];
  const secondScore = ranked[1]?.[1] || 0;
  if (bestScore < 3) return null;
  if (bestScore <= secondScore) return null;
  if (strong[bestCode] === 0 && bestScore < 4) return null;
  return bestCode;
}

/**
 * storeLocale is only used when a caller already has a real Shopify locale.
 * We do not fetch one today: Shop.primaryLocale does not exist, and
 * shopLocales requires the read_locales scope, which this app does not have.
 */
export function resolveReplyLanguage({ setting, messageText, storeLocale } = {}) {
  if (setting && setting !== "auto" && REPLY_LANGUAGE_NAMES[setting]) {
    return { code: setting, name: REPLY_LANGUAGE_NAMES[setting], source: "forced" };
  }
  const detected = detectMessageLanguage(messageText);
  if (detected) {
    return { code: detected, name: REPLY_LANGUAGE_NAMES[detected], source: "customer" };
  }
  // Real words we cannot place. Still the customer's language talking, so it
  // outranks the store locale exactly as a detected language would. code stays
  // null: describeOffer falls back to its English phrasing for an unknown
  // code, and the prompt tells the model to say it in the customer's language.
  if (hasWords(messageText)) {
    return { code: null, name: "the same language the customer used", source: "mirror" };
  }
  const store = normalizeStoreLocale(storeLocale);
  if (store && store !== "en") {
    return { code: store, name: REPLY_LANGUAGE_NAMES[store], source: "store" };
  }
  return { code: "en", name: "English", source: "default" };
}

export function languageInstructionText(resolved) {
  const oneLanguage =
    "Write the ENTIRE reply in that one language. Never mix languages, never switch partway through, and never add a sentence in a different language. Product names stay in their original form.";
  if (resolved.source === "forced") {
    return `LANGUAGE (highest priority): Write your ENTIRE reply in ${resolved.name}, regardless of the language the customer used. ${oneLanguage}`;
  }
  if (resolved.source === "customer") {
    return `LANGUAGE (highest priority): The customer wrote in ${resolved.name}. Write your ENTIRE reply in ${resolved.name}. ${oneLanguage}`;
  }
  if (resolved.source === "mirror") {
    return `LANGUAGE (highest priority): Reply in the SAME language the customer wrote in, matching their script exactly. Do not translate to English and do not answer in English unless they wrote in English. Write the ENTIRE reply in their language, including any price, discount or shipping line. Never mix languages and never switch partway through. Product names stay in their original form.`;
  }
  if (resolved.source === "store") {
    return `LANGUAGE (highest priority): The customer's message has no detectable language. This store's language is ${resolved.name}, so write your ENTIRE reply in ${resolved.name}. Do not guess a different language. ${oneLanguage}`;
  }
  return `LANGUAGE (highest priority): The customer's message contains no words at all (emoji, hearts, or punctuation only). Write your ENTIRE reply in English. Do not guess Spanish, Portuguese, or any other language. ${oneLanguage}`;
}

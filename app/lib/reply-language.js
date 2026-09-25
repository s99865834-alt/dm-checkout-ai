/**
 * Which language a reply should be in.
 *
 * Default is English. Auto only leaves English when the customer clearly
 * wrote in another language, or when the store's primary locale is not
 * English. Emoji, hearts, and short noise are not a language, so they stay
 * English. A reply is always one language, never two.
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

function tokenize(text) {
  const stripped = String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/#\w+/g, " ")
    .toLowerCase();
  return stripped.match(/[a-zà-öø-ÿãõáéíóúüñç]+/gi) || [];
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

export function resolveReplyLanguage({ setting, messageText, storeLocale } = {}) {
  if (setting && setting !== "auto" && REPLY_LANGUAGE_NAMES[setting]) {
    return { code: setting, name: REPLY_LANGUAGE_NAMES[setting], source: "forced" };
  }
  const detected = detectMessageLanguage(messageText);
  if (detected) {
    return { code: detected, name: REPLY_LANGUAGE_NAMES[detected], source: "customer" };
  }
  const store = normalizeStoreLocale(storeLocale);
  if (store && store !== "en") {
    return { code: store, name: REPLY_LANGUAGE_NAMES[store], source: "store" };
  }
  return { code: "en", name: "English", source: "default" };
}

export function storeLocaleFrom(shop, storeInfo) {
  return storeInfo?.primaryLocale || shop?.store_context_json?.primaryLocale || null;
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
  if (resolved.source === "store") {
    return `LANGUAGE (highest priority): The customer's message has no detectable language. This store's language is ${resolved.name}, so write your ENTIRE reply in ${resolved.name}. Do not guess a different language. ${oneLanguage}`;
  }
  return `LANGUAGE (highest priority): The customer's message has no detectable language (emoji, hearts, or too short to tell). Write your ENTIRE reply in English. Do not guess Spanish, Portuguese, or any other language. ${oneLanguage}`;
}

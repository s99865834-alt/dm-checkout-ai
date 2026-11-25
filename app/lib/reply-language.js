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
 *
 * Word lists also cannot tell English from anything when an English customer
 * writes "How much for tab case?", and a follow-up like "A16 ipad" or
 * "Ipad pro 12.9" is a model name in any language. Tabcase answered exactly
 * that English customer in Arabic, the language of its own instructions. So a
 * script is read as a language where the script settles it, a message with no
 * language of its own takes the one the customer has been writing in, and
 * the reply is checked against it before it goes out.
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
  en: [
    "thanks", "thank", "please", "love", "need", "want", "this", "these", "amazing", "awesome",
    "how", "much", "what", "does", "can", "have", "any", "your", "available", "price", "shipping",
    "hello", "hey", "hi",
  ],
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

const SCRIPTS = [
  "Arabic", "Hebrew", "Cyrillic", "Greek", "Thai", "Hangul", "Hiragana", "Katakana", "Han",
  "Devanagari", "Bengali", "Tamil", "Telugu", "Gujarati", "Gurmukhi", "Kannada", "Malayalam",
  "Sinhala", "Georgian", "Armenian", "Ethiopic", "Khmer", "Lao", "Myanmar",
].map((name) => [name, new RegExp(`\\p{Script=${name}}`, "u")]);

// Scripts that name one language. Cyrillic and Devanagari each carry several,
// so they only name one when its own letters show up (see scriptLanguage).
const SCRIPT_LANGUAGE = {
  Hebrew: ["he", "Hebrew"], Greek: ["el", "Greek"], Thai: ["th", "Thai"], Hangul: ["ko", "Korean"],
  Japanese: ["ja", "Japanese"], Han: ["zh", "Chinese"], Bengali: ["bn", "Bengali"],
  Tamil: ["ta", "Tamil"], Telugu: ["te", "Telugu"], Gujarati: ["gu", "Gujarati"],
  Gurmukhi: ["pa", "Punjabi"], Kannada: ["kn", "Kannada"], Malayalam: ["ml", "Malayalam"],
  Sinhala: ["si", "Sinhala"], Georgian: ["ka", "Georgian"], Armenian: ["hy", "Armenian"],
  Ethiopic: ["am", "Amharic"], Khmer: ["km", "Khmer"], Lao: ["lo", "Lao"], Myanmar: ["my", "Burmese"],
};

/** Letters per script. Kana makes the Han letters around it Japanese. */
function scriptCounts(text) {
  const counts = {};
  for (const ch of stripNonLanguage(text).match(/\p{L}/gu) || []) {
    const script = /\p{Script=Latin}/u.test(ch) ? "Latin" : SCRIPTS.find(([, re]) => re.test(ch))?.[0] || "Other";
    counts[script] = (counts[script] || 0) + 1;
  }
  const kana = (counts.Hiragana || 0) + (counts.Katakana || 0);
  if (kana) {
    counts.Japanese = kana + (counts.Han || 0);
    delete counts.Hiragana;
    delete counts.Katakana;
    delete counts.Han;
  }
  return counts;
}

function scriptLanguage(script, text) {
  if (script === "Arabic") {
    if (/[ٹڈڑںے]/u.test(text)) return { code: "ur", name: "Urdu", script };
    const persian = (text.match(/[یکپژچگ]/gu) || []).length;
    const arabic = (text.match(/[يكةىأإ]/gu) || []).length;
    if (persian > arabic && /[یک]/u.test(text)) return { code: "fa", name: "Persian", script };
    return { code: "ar", name: "Arabic", script };
  }
  if (script === "Cyrillic") {
    if (/[әғқңөұүһ]/iu.test(text)) return { code: "kk", name: "Kazakh", script };
    if (/ў/iu.test(text)) return { code: "be", name: "Belarusian", script };
    if (/[іїєґ]/iu.test(text)) return { code: "uk", name: "Ukrainian", script };
    if (/[ѓќѕ]/iu.test(text)) return { code: "mk", name: "Macedonian", script };
    if (/[ђћџљњј]/iu.test(text)) return { code: "sr", name: "Serbian", script };
  }
  const known = SCRIPT_LANGUAGE[script];
  return known ? { code: known[0], name: known[1], script } : { code: null, name: null, script };
}

/**
 * The language a message is written in, from its script when the script
 * settles it, otherwise from the Latin word lists. A non-Latin script wins
 * when it is at least a third of the letters, so "عندكم كفر iPad Pro 12.9؟"
 * is Arabic with product names in it, not English.
 *
 * @returns {{code: string|null, name: string|null, script: string}|null}
 */
export function detectLanguage(text) {
  const counts = scriptCounts(text);
  const [script, n] =
    Object.entries(counts)
      .filter(([s]) => s !== "Latin" && s !== "Other")
      .sort((a, b) => b[1] - a[1])[0] || [];
  if (script && n >= 2 && n * 2 >= (counts.Latin || 0)) return scriptLanguage(script, text);
  const code = detectMessageLanguage(text);
  return code ? { code, name: REPLY_LANGUAGE_NAMES[code], script: "Latin" } : null;
}

const UNNAMED = "the customer's language";

function named(detected, source) {
  const resolved = { code: detected.code, name: detected.name || UNNAMED, source };
  if (!detected.code || !REPLY_LANGUAGE_NAMES[detected.code]) resolved.script = detected.script;
  return resolved;
}

/**
 * storeLocale is only used when a caller already has a real Shopify locale.
 * We do not fetch one today: Shop.primaryLocale does not exist, and
 * shopLocales requires the read_locales scope, which this app does not have.
 *
 * recentCustomerTexts are the customer's earlier messages in this thread,
 * newest first. They decide only when this message has no language of its
 * own, so a customer who switches language is answered in the new one.
 */
export function resolveReplyLanguage({ setting, messageText, recentCustomerTexts = [], storeLocale } = {}) {
  if (setting && setting !== "auto" && REPLY_LANGUAGE_NAMES[setting]) {
    return { code: setting, name: REPLY_LANGUAGE_NAMES[setting], source: "forced" };
  }
  const own = detectLanguage(messageText);
  if (own) return named(own, own.name ? "customer" : "script");
  for (const earlier of (recentCustomerTexts || []).slice(0, 8)) {
    const prior = detectLanguage(earlier);
    if (prior) return named(prior, "thread");
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

const NOT_THE_STORE_LANGUAGE =
  "The store's own instructions, product names and catalog may be written in another language; that never changes the language of the reply.";

export function languageInstructionText(resolved) {
  const oneLanguage =
    "Write the ENTIRE reply in that one language, including any price, discount or shipping line. Never mix languages, never switch partway through, and never add a sentence in a different language. Product names stay in their original form.";
  if (resolved.source === "forced") {
    return `LANGUAGE (highest priority): Write your ENTIRE reply in ${resolved.name}, regardless of the language the customer used. ${oneLanguage}`;
  }
  if (resolved.source === "customer") {
    return `LANGUAGE (highest priority): The customer wrote in ${resolved.name}. Write your ENTIRE reply in ${resolved.name}. ${oneLanguage} ${NOT_THE_STORE_LANGUAGE}`;
  }
  if (resolved.source === "script") {
    return `LANGUAGE (highest priority): The customer wrote in a language that uses the ${resolved.script} script. Reply in that same language and script, never in English. ${oneLanguage} ${NOT_THE_STORE_LANGUAGE}`;
  }
  if (resolved.source === "thread") {
    const language = resolved.name === UNNAMED ? `a language written in the ${resolved.script} script` : resolved.name;
    return `LANGUAGE (highest priority): The customer has been writing to you in ${language}. Their latest message is only a product name, number or emoji, so it does not change that: write your ENTIRE reply in ${language}. ${oneLanguage} ${NOT_THE_STORE_LANGUAGE}`;
  }
  if (resolved.source === "mirror") {
    return `LANGUAGE (highest priority): Reply in the SAME language the customer wrote in, matching their script exactly. Do not translate to English and do not answer in English unless they wrote in English. Write the ENTIRE reply in their language, including any price, discount or shipping line. Never mix languages and never switch partway through. Product names stay in their original form. ${NOT_THE_STORE_LANGUAGE}`;
  }
  if (resolved.source === "store") {
    return `LANGUAGE (highest priority): The customer's message has no detectable language. This store's language is ${resolved.name}, so write your ENTIRE reply in ${resolved.name}. Do not guess a different language. ${oneLanguage}`;
  }
  return `LANGUAGE (highest priority): The customer's message contains no words at all (emoji, hearts, or punctuation only). Write your ENTIRE reply in English. Do not guess Spanish, Portuguese, or any other language. ${oneLanguage}`;
}

const CODE_SCRIPT = {
  ...Object.fromEntries(Object.entries(SCRIPT_LANGUAGE).map(([script, [code]]) => [code, script])),
  ar: "Arabic", fa: "Arabic", ur: "Arabic",
  kk: "Cyrillic", be: "Cyrillic", uk: "Cyrillic", mk: "Cyrillic", sr: "Cyrillic",
};

function majorityScript(text) {
  const counts = scriptCounts(text);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const [script, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  return script && script !== "Other" && n * 2 > total ? script : null;
}

function expectedScript(resolved, customerText) {
  if (!resolved) return null;
  if (resolved.script) return resolved.script;
  if (REPLY_LANGUAGE_NAMES[resolved.code]) return "Latin";
  if (CODE_SCRIPT[resolved.code]) return CODE_SCRIPT[resolved.code];
  if (resolved.source === "mirror") return majorityScript(customerText);
  return null;
}

/**
 * True when a reply is not in the language it was meant to be.
 *
 * Product names are usually in Latin letters, so the test is lopsided. A reply
 * meant for Arabic (or any non-Latin script) only needs a third of its letters
 * in that script, because "Design 24" and "iPad Pro 11 M4" are not English.
 * A reply meant for a Latin language is wrong once another script makes up a
 * third of it, or when it is a different one of the languages we recognise.
 */
export function replyLanguageMismatch(reply, resolved, customerText = "") {
  const script = expectedScript(resolved, customerText);
  if (!script || !reply) return false;
  const counts = scriptCounts(reply);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < 8) return false;
  if (script !== "Latin") return (counts[script] || 0) * 3 < total;
  if (Object.entries(counts).some(([s, n]) => s !== "Latin" && s !== "Other" && n * 3 >= total)) return true;
  if (REPLY_LANGUAGE_NAMES[resolved.code]) {
    const replyCode = detectMessageLanguage(reply);
    if (replyCode && replyCode !== resolved.code) return true;
  }
  return false;
}

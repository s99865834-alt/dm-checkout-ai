/**
 * A price only goes out in a reply if the store's own data contains it.
 *
 * Nov 2026. The catalog search handed the model prices in minor units, so a
 * Shane's eCares customer was told a $15.00 jar cost $1,500 and a Tabcase
 * customer that a 7.500 OMR case cost 75 OMR. Tabcase switched its replies
 * off the next day. Both prompts already said never to invent a price; a
 * prompt is a request, and this is the check.
 *
 * Each reply path collects the prices it gave the model in a price book: tool
 * results, product context, the merchant's own instruction. A price in the
 * reply must equal one of those, a 2 to 9 unit total of one, or one with the
 * offered discount applied, and it must be in the store's currency. Ten times
 * a price is never accepted, because that is the shape of the error this
 * exists for. A failing price is corrected when it is exactly a power of ten
 * away from a single known price; otherwise its sentence is removed.
 */

const ISO_CODES = new Set(
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : []
);

// Codes that are also everyday words in a DM ("ALL 3 colours", "TOP 10").
// They only mark a price when they are the store's own currency.
const WORD_LIKE_CODES = new Set([
  "ALL", "AMD", "ANG", "BAM", "BOB", "CUP", "GEL", "MAD", "MOP", "PEN", "SOS", "TOP", "TRY", "WST",
]);

const DOLLARS = [
  "USD", "CAD", "AUD", "NZD", "HKD", "SGD", "MXN", "TWD", "JMD", "TTD", "BSD", "BBD", "BZD", "BMD",
  "KYD", "XCD", "FJD", "LRD", "NAD", "SBD", "SRD", "GYD", "BND", "ARS", "CLP", "COP", "UYU", "DOP",
  "NIO", "CUP",
];
const RIYALS = ["OMR", "SAR", "QAR", "YER", "IRR"];
const DINARS = ["KWD", "BHD", "JOD", "IQD", "LYD", "TND", "DZD", "RSD", "MKD"];
const DIRHAMS = ["AED", "MAD"];
const RUPEES = ["INR", "PKR", "LKR", "NPR", "MUR", "SCR"];
const POUNDS = ["GBP", "EGP", "SDG", "SSP", "LBP", "SYP", "GIP", "FKP", "SHP"];
const LIRAS = ["TRY", "LBP", "SYP"];
const PESOS = ["MXN", "ARS", "CLP", "COP", "PHP", "UYU", "DOP", "CUP"];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SP = "[\\s\\u00a0\\u202f]?";

function marker(source, currencies, { flags = "u", abbreviation = false } = {}) {
  return {
    currencies,
    abbreviation,
    before: new RegExp(`(?<![A-Za-z])(?:${source})${SP}$`, flags),
    after: new RegExp(`^${SP}(?:${source})(?![A-Za-z])`, flags),
  };
}

function arabicAbbreviation(letters) {
  const [a, b] = [...letters];
  return `${a}\\s?\\.\\s?${b}`;
}

const MARKERS = [
  ...[
    ["US$", ["USD"]], ["CA$", ["CAD"]], ["AU$", ["AUD"]], ["NZ$", ["NZD"]], ["HK$", ["HKD"]],
    ["MX$", ["MXN"]], ["C$", ["CAD", "NIO"]], ["A$", ["AUD"]], ["S$", ["SGD"]], ["R$", ["BRL"]],
    ["$", DOLLARS], ["€", ["EUR"]], ["£", POUNDS], ["¥", ["JPY", "CNY"]], ["₹", ["INR"]],
    ["₩", ["KRW"]], ["₺", ["TRY"]], ["₪", ["ILS"]], ["₱", ["PHP"]], ["₦", ["NGN"]], ["₫", ["VND"]],
    ["฿", ["THB"]], ["₴", ["UAH"]], ["₸", ["KZT"]], ["₽", ["RUB"]], ["₼", ["AZN"]], ["₾", ["GEL"]],
    ["₡", ["CRC"]], ["₲", ["PYG"]], ["₵", ["GHS"]], ["₭", ["LAK"]], ["₮", ["MNT"]], ["₨", RUPEES],
    ["﷼", RIYALS],
  ].map(([symbol, currencies]) => ({
    currencies,
    abbreviation: false,
    before: new RegExp(`${esc(symbol)}${SP}$`, "u"),
    after: new RegExp(`^${SP}${esc(symbol)}`, "u"),
  })),
  ...[
    ["رع", ["OMR"]], ["رس", ["SAR"]], ["دإ", ["AED"]], ["دك", ["KWD"]], ["دب", ["BHD"]],
    ["رق", ["QAR"]], ["جم", ["EGP"]], ["دا", ["JOD"]], ["دأ", ["JOD"]], ["دع", ["IQD"]],
    ["دج", ["DZD"]], ["دم", ["MAD"]], ["دت", ["TND"]], ["دل", ["LYD"]], ["لل", ["LBP"]],
    ["لس", ["SYP"]], ["ري", ["YER"]],
  ].map(([letters, currencies]) => ({
    currencies,
    abbreviation: false,
    before: new RegExp(`${arabicAbbreviation(letters)}\\.?${SP}$`, "u"),
    after: new RegExp(`^${SP}${arabicAbbreviation(letters)}`, "u"),
  })),
  ...[
    ["ريالات|ريالا|ريال", RIYALS], ["دراهم|درهم", DIRHAMS], ["دنانير|دينار", DINARS],
    ["جنيهات|جنيه", POUNDS], ["ليرات|ليرة", LIRAS], ["دولارات|دولار", DOLLARS], ["يورو", ["EUR"]],
    ["روبية", RUPEES],
  ].map(([words, currencies]) => ({
    currencies,
    abbreviation: false,
    before: new RegExp(`(?:${words})${SP}$`, "u"),
    after: new RegExp(`^${SP}(?:${words})`, "u"),
  })),
  ...[
    ["dollars?|bucks", DOLLARS], ["euros?", ["EUR"]], ["rupees?", RUPEES], ["rupiah", ["IDR"]],
    ["ringgit", ["MYR"]], ["dirhams?", DIRHAMS], ["riyals?|rials?", RIYALS], ["dinars?", DINARS],
    ["pesos?", PESOS], ["yen", ["JPY"]], ["yuan|rmb", ["CNY"]], ["liras?", LIRAS],
    ["shekels?", ["ILS"]], ["baht", ["THB"]], ["naira", ["NGN"]], ["francs?", ["CHF", "XOF", "XAF", "XPF"]],
    ["kronor|krona", ["SEK", "ISK"]], ["kroner|krone", ["NOK", "DKK"]], ["zloty", ["PLN"]], ["forint", ["HUF"]],
  ].map(([words, currencies]) => ({
    currencies,
    abbreviation: false,
    before: /(?!)/,
    after: new RegExp(`^${SP}(?:${words})\\b`, "iu"),
  })),
  // Short forms that collide with ordinary words or units ("6 Ft", "SR 2").
  // They count only when they can mean the store's own currency.
  ...[
    ["Rs\\.?", RUPEES], ["Rp", ["IDR"]], ["RM", ["MYR"]], ["kr\\.?", ["SEK", "NOK", "DKK", "ISK"]],
    ["zł", ["PLN"]], ["Kč", ["CZK"]], ["Ft", ["HUF"]], ["Dhs?", DIRHAMS], ["KD", ["KWD"]],
    ["BD", ["BHD"]], ["RO", ["OMR"]], ["SR", ["SAR"]], ["QR", ["QAR"]], ["LE", ["EGP"]],
    ["Fr\\.?", ["CHF"]],
  ].map(([source, currencies]) => marker(source, currencies, { abbreviation: true })),
];

// Amounts written in the currency's small unit: 99 cents, 500 baisa.
const MINOR_AFTER = new RegExp(`^${SP}(?:cents?|¢|baisas?|baizas?|بيسة|بيسات|fils|فلس)(?![A-Za-z])`, "iu");

const ISO_BEFORE = /(?<![A-Za-z])([A-Z]{3})\.?[\s\u00a0\u202f]?$/;
const ISO_AFTER = /^[\s\u00a0\u202f]?([A-Z]{3})(?![A-Za-z])/;

// A bare number right after a price word ("the price is 75", "السعر 75").
const PRICE_WORD_BEFORE =
  /(?:\bprices?|\bpriced(?: at)?|\bcosts?|\bprecio|\bprix|\bpreço|\bpreis|السعر|سعره|سعرها|سعر|بسعر|الأسعار|الاسعار|تكلفة|يكلف|تكلف|(?<![\u0600-\u06FF])ب)[\s\u00a0]*(?:is|are|at|from|:|=|هو|هي|يبلغ|من)?[\s\u00a0:]*$/iu;
const UNIT_AFTER =
  /^[\s\u00a0]?(?:%|x\b|×|inch|inches|in\b|"|”|cm|mm|m\b|gb|tb|mb|oz|ml|l\b|kg|g\b|lbs?|days?|hours?|hrs?|weeks?|months?|years?|pcs|pieces?|items?|units?|انش|إنش|بوصة|يوم|أيام|ايام|ساعة|ساعات|قطعة|قطع|شهر|أشهر|اشهر|سنة|سنوات|حبة|حبات)/iu;
const RANGE_GAP = /^[\s\u00a0]*(?:-|\u2013|\u2014|~|to|إلى|الى|حتى)[\s\u00a0]*$/iu;

const NUMBER_RE =
  /(?<![\p{L}\p{N}_.,])(?:\d{1,3}(?:[,.\u00a0\u202f']\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?!\p{N})/gu;

/**
 * Arabic-Indic and Persian digits to ASCII, the Arabic decimal and thousands
 * marks to "." and ",", and tatweel to a space. One character for one, so
 * positions in the result are positions in the original.
 */
function normalize(text) {
  return text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, ".")
    .replace(/\u066c/g, ",")
    .replace(/\u0640/g, " ");
}

/** Every value a written number can mean: "1,500" is 1500 or 1.5, "7.500" is 7.5 or 7500. */
function interpretations(raw) {
  const s = raw.replace(/[\u00a0\u202f']/g, "");
  const out = [];
  const dot = s.match(/^(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d+))?$/);
  if (dot) out.push(Number(`${dot[1].replace(/,/g, "")}${dot[2] ? `.${dot[2]}` : ""}`));
  const comma = s.match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d+))?$/);
  if (comma) out.push(Number(`${comma[1].replace(/\./g, "")}${comma[2] ? `.${comma[2]}` : ""}`));
  return [...new Set(out.filter(Number.isFinite))];
}

export function currencyFractionDigits(currency) {
  if (!currency) return null;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits;
  } catch {
    return null;
  }
}

/** "7.500" plus "OMR" is "7.500 OMR". A price the model reads must say what currency it is in. */
export function withCurrency(amount, currency) {
  if (amount == null || amount === "") return null;
  const str = String(amount).trim();
  if (!currency || /[A-Z]{3}\s*$/.test(str)) return str;
  return `${str} ${String(currency).trim().toUpperCase()}`;
}

function markerAt(norm, start, end, storeCurrency) {
  const before = norm.slice(Math.max(0, start - 12), start);
  const after = norm.slice(end, end + 14);

  if (MINOR_AFTER.test(after)) {
    const m = after.match(MINOR_AFTER);
    return { currencies: null, minor: true, start, end: end + m[0].length };
  }
  for (const mk of MARKERS) {
    const b = before.match(mk.before);
    const a = b ? null : after.match(mk.after);
    if (!b && !a) continue;
    if (mk.abbreviation && storeCurrency && !mk.currencies.includes(storeCurrency)) continue;
    return {
      currencies: mk.currencies,
      minor: false,
      start: b ? start - b[0].length : start,
      end: a ? end + a[0].length : end,
    };
  }
  const isCurrencyCode = (code) =>
    ISO_CODES.has(code) && (!WORD_LIKE_CODES.has(code) || code === storeCurrency);
  const isoBefore = before.match(ISO_BEFORE);
  if (isoBefore && isCurrencyCode(isoBefore[1])) {
    return { currencies: [isoBefore[1]], minor: false, start: start - isoBefore[0].length, end };
  }
  const isoAfter = after.match(ISO_AFTER);
  if (isoAfter && isCurrencyCode(isoAfter[1])) {
    return { currencies: [isoAfter[1]], minor: false, start, end: end + isoAfter[0].length };
  }
  return null;
}

// "2-3 days" is a unit, not a price, even after a price word.
function followedByUnit(after) {
  return UNIT_AFTER.test(after.replace(/^[\s\u00a0]*(?:-|\u2013|\u2014|~|to)[\s\u00a0]*\d+(?:[.,]\d+)?/i, ""));
}

/**
 * Every number in `text` that is written as money, with each value it could
 * mean. `storeCurrency` decides whether an ambiguous short form ("RO", "Ft")
 * is a currency at all.
 */
export function findPriceMentions(text, storeCurrency = null) {
  if (!text || typeof text !== "string") return [];
  const norm = normalize(text);
  const urls = [...norm.matchAll(URL_RE)].map((u) => [u.index, u.index + u[0].length]);
  const tokens = [];
  for (const m of norm.matchAll(NUMBER_RE)) {
    if (urls.some(([s, e]) => m.index >= s && m.index < e)) continue;
    tokens.push({ numStart: m.index, numEnd: m.index + m[0].length, digits: m[0] });
  }

  for (const t of tokens) {
    const mk = markerAt(norm, t.numStart, t.numEnd, storeCurrency);
    if (mk) {
      Object.assign(t, { price: true, currencies: mk.currencies, minor: mk.minor, start: mk.start, end: mk.end });
      continue;
    }
    const before = norm.slice(Math.max(0, t.numStart - 30), t.numStart);
    const after = norm.slice(t.numEnd, t.numEnd + 20);
    if (PRICE_WORD_BEFORE.test(before) && !followedByUnit(after)) {
      Object.assign(t, { price: true, currencies: null, minor: false, start: t.numStart, end: t.numEnd });
    }
  }

  // "5.9 - 8.5 OMR" and "$15-25": the bare end of a range is a price too.
  for (let i = 0; i < tokens.length - 1; i++) {
    const [a, b] = [tokens[i], tokens[i + 1]];
    if (a.price === b.price || !RANGE_GAP.test(norm.slice(a.numEnd, b.numStart))) continue;
    const [bare, priced] = a.price ? [b, a] : [a, b];
    if (UNIT_AFTER.test(norm.slice(bare.numEnd, bare.numEnd + 12))) continue;
    Object.assign(bare, {
      price: true,
      currencies: priced.currencies,
      minor: priced.minor,
      start: bare.numStart,
      end: bare.numEnd,
    });
  }

  return tokens
    .filter((t) => t.price)
    .map((t) => {
      const base = interpretations(t.digits);
      const values = t.minor ? base.flatMap((v) => [v / 100, v / 1000]) : base;
      return {
        start: t.start,
        end: t.end,
        numStart: t.numStart,
        numEnd: t.numEnd,
        raw: text.slice(t.start, t.end).trim(),
        values,
        currencies: t.currencies,
      };
    });
}

export function createPriceBook() {
  return { prices: [], percentsOff: [], amountsOff: [], currency: null };
}

/**
 * A product price from structured store data, in major units: "7.500",
 * "7.500 OMR", "5.9-8.5 OMR", or a number. These are exact, so "7.500" here
 * is 7.5. Only product prices can be multiplied into a total or discounted.
 */
export function addPrice(book, price, { currency = null, label = null } = {}) {
  if (!book || price == null || price === "") return book;
  const str = String(price).trim();
  const code = str.match(/\b([A-Z]{3})\s*$/)?.[1] || (currency ? String(currency).trim().toUpperCase() : null);
  for (const amount of str.match(/\d+(?:\.\d+)?/g) || []) {
    const value = Number(amount);
    if (Number.isFinite(value) && value >= 0) book.prices.push({ value, label, currency: code, kind: "product" });
  }
  if (code && !book.currency && ISO_CODES.has(code)) book.currency = code;
  return book;
}

/**
 * Amounts written in text the model was given: a product description ("3 for
 * $60"), store policies ("free shipping over 20 OMR"), the merchant's own
 * instruction ("delivery 2 OMR"). They may be quoted as written. Percentages
 * there may be discounts the merchant offers.
 */
export function addPricesFromText(book, text, { label = null } = {}) {
  if (!book || !text || typeof text !== "string") return book;
  for (const m of findPriceMentions(text, book.currency)) {
    if (m.values.length) book.prices.push({ value: m.values[0], label, currency: null, kind: "text" });
  }
  for (const p of normalize(text).matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)) {
    const pct = Number(p[1].replace(",", "."));
    if (pct > 0 && pct < 100) book.percentsOff.push(pct);
  }
  return book;
}

/** The discount a checkout link carries, so the discounted price can be quoted. */
export function addDiscount(book, { type, value } = {}) {
  const v = Number(value);
  if (!book || !Number.isFinite(v) || v <= 0) return book;
  if (type === "amount") {
    book.amountsOff.push(v);
    book.prices.push({ value: v, label: "discount", currency: null, kind: "text" });
  } else if (v < 100) {
    book.percentsOff.push(v);
  }
  return book;
}

const QUANTITY_WORDS = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, both: 2, pair: 2, couple: 2, dozen: 12,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
  duas: 2, "três": 3, quatro: 4,
  zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
};
const QUANTITY_WORD_RE = new RegExp(`\\b(${Object.keys(QUANTITY_WORDS).join("|")})\\b`, "giu");
const ARABIC_QUANTITY_WORDS = [
  ["اثنين|اثنان|إثنين|ثنتين|كلاهما|كليهما", 2], ["ثلاث|ثلاثة", 3], ["أربع|اربع|أربعة|اربعة", 4],
  ["خمس|خمسة", 5], ["ست|ستة", 6], ["سبع|سبعة", 7], ["ثمان|ثماني|ثمانية", 8], ["تسع|تسعة", 9],
  ["عشر|عشرة", 10],
].map(([words, n]) => [new RegExp(`(?<![\\u0600-\\u06FF])(?:و|ب|ل|ال|وال|بال|لل)?(?:${words})(?![\\u0600-\\u06FF])`, "u"), n]);
// "3 jars", "2 small jars", "10 iPads". Not "iPad 10 works" or "Design 24 fits".
const COUNTED_RE = /(?:^|[^\p{L}\p{N}.,#])(\d{1,3})\s+(?:[a-z]+\s+)?([a-z]{3,}s)\b/giu;
const NOT_COUNTED = new Set([
  "days", "hours", "hrs", "weeks", "months", "years", "minutes", "mins", "seconds", "inches",
  "feet", "meters", "metres", "grams", "kilos", "pounds", "ounces", "liters", "litres", "percent",
  "times", "has", "was", "this", "its", "yes", "plus", "less", "thus", "does", "goes", "gets",
  "takes", "comes", "fits", "works", "looks", "ships", "costs", "needs", "lets", "always",
  "perhaps", "ours", "yours", "theirs", "hers", "his",
]);
const MODEL_WORDS =
  /(?:ipad|iphone|galaxy|pixel|air|pro|mini|max|ultra|plus|series|gen|generation|model|design|version|size|no|number|watch|tab|note|s)\s*$/i;

/** Quantities a sentence states, so "three jars are $45" can be a total. */
function quantitiesIn(sentence) {
  const norm = normalize(sentence);
  const found = new Set();
  for (const m of norm.matchAll(QUANTITY_WORD_RE)) found.add(QUANTITY_WORDS[m[1].toLowerCase()]);
  for (const [re, n] of ARABIC_QUANTITY_WORDS) if (re.test(norm)) found.add(n);
  for (const m of norm.matchAll(/(?:\bx|×)\s?(\d{1,3})(?!\p{N})|(?<![\p{L}\p{N}.,])(\d{1,3})\s?(?:x|×)(?!\p{L})/giu)) {
    found.add(Number(m[1] || m[2]));
  }
  for (const m of norm.matchAll(/\b(?:qty|quantity|pack of|set of|box of)\s*:?\s*(\d{1,3})\b/giu)) found.add(Number(m[1]));
  for (const m of norm.matchAll(COUNTED_RE)) {
    const numberAt = m.index + m[0].indexOf(m[1]);
    if (NOT_COUNTED.has(m[2].toLowerCase()) || MODEL_WORDS.test(norm.slice(0, numberAt))) continue;
    found.add(Number(m[1]));
  }
  return [...found].filter((n) => Number.isInteger(n) && n >= 2 && n <= 1000);
}

function tolerance(book) {
  const digits = currencyFractionDigits(book.currency);
  return (digits == null ? 0.005 : 0.5 / 10 ** digits) + 1e-9;
}

function isKnownValue(value, book, quantities) {
  const tol = tolerance(book);
  const near = (a, b, k = 1) => Math.abs(a - b) <= tol * k;
  for (const { value: p, kind } of book.prices) {
    if (near(value, p)) return true;
    if (kind !== "product") continue;
    for (const k of quantities) if (near(value, k * p, k)) return true;
    for (const pct of book.percentsOff) {
      const each = p * (1 - pct / 100);
      if (near(value, each) || quantities.some((k) => near(value, k * each, k))) return true;
    }
    for (const off of book.amountsOff) if (p > off && near(value, p - off)) return true;
  }
  return false;
}

function inStoreCurrency(mention, book) {
  return !book.currency || !mention.currencies || mention.currencies.includes(book.currency);
}

const URL_RE = /https?:\/\/[^\s]+/g;
const cleanUrl = (u) => u.replace(/[.,;:!?)\]]+$/, "");

function sentenceRanges(text) {
  const ranges = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?؟。！？]+(?=[\s\u00a0]|$)|\n+/g)) {
    const end = m.index + m[0].length;
    ranges.push([start, end]);
    start = end;
  }
  if (start < text.length) ranges.push([start, text.length]);
  return ranges;
}

function checkMentions(text, book) {
  const mentions = findPriceMentions(text, book?.currency);
  if (!mentions.length) return [];
  const ranges = sentenceRanges(text);
  return mentions.map((m) => {
    const [s, e] = ranges.find(([rs, re]) => m.start >= rs && m.start < re) || [0, text.length];
    const quantities = quantitiesIn(text.slice(s, e));
    const ok = inStoreCurrency(m, book) && m.values.some((v) => isKnownValue(v, book, quantities));
    return { ...m, quantities, ok };
  });
}

/** Price mentions in `text` that the book does not account for. */
export function unverifiedPrices(text, book) {
  if (!book) return [];
  return checkMentions(text, book).filter((m) => !m.ok);
}

// A price exactly a power of ten away from one known product price (or a
// stated quantity of it) is that price, misread. Two candidates is a guess.
function scaleCorrection(mention, book) {
  if (!inStoreCurrency(mention, book)) return null;
  const tol = tolerance(book);
  const hits = new Map();
  for (const v of mention.values) {
    for (const j of [1, 2, 3, -1, -2, -3]) {
      const candidate = v / 10 ** j;
      for (const { value: p, kind } of book.prices) {
        if (kind !== "product" || p <= 0) continue;
        for (const k of [1, ...mention.quantities]) {
          if (Math.abs(candidate - k * p) <= tol * k) hits.set((k * p).toFixed(6), k * p);
        }
      }
    }
  }
  return hits.size === 1 ? [...hits.values()][0] : null;
}

function formatAmount(value, currency) {
  const digits = currencyFractionDigits(currency);
  if (digits != null) return value.toFixed(digits);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** True when a reply still says something once its links are set aside. */
export function hasWords(text) {
  return !!text && /\p{L}{2,}/u.test(text.replace(URL_RE, ""));
}

/**
 * Make every price in `text` one the book accounts for. Returns the text with
 * scale errors corrected and any other unaccounted-for price removed along
 * with its sentence. A link in a removed sentence is kept at the end.
 */
export function enforcePrices(text, book) {
  const unchanged = { text, corrected: [], removed: [] };
  if (!text || !book) return unchanged;
  const found = checkMentions(text, book).filter((m) => !m.ok);
  if (!found.length) return unchanged;

  let result = text;
  const corrected = [];
  for (const m of [...found].sort((a, b) => b.numStart - a.numStart)) {
    const fix = scaleCorrection(m, book);
    if (fix == null) continue;
    const replacement = formatAmount(fix, book.currency);
    corrected.unshift({ from: m.raw, to: replacement });
    result = result.slice(0, m.numStart) + replacement + result.slice(m.numEnd);
  }

  const remaining = checkMentions(result, book).filter((m) => !m.ok);
  if (!remaining.length) return { text: result, corrected, removed: [] };

  const kept = [];
  const orphanUrls = [];
  for (const [start, end] of sentenceRanges(result)) {
    const segment = result.slice(start, end);
    if (remaining.some((m) => m.start < end && m.end > start)) {
      orphanUrls.push(...(segment.match(URL_RE) || []).map(cleanUrl));
    } else {
      kept.push(segment);
    }
  }
  let stripped = kept.join("").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const missing = [...new Set(orphanUrls)].filter((u) => !stripped.includes(u));
  if (missing.length) stripped = [stripped, ...missing].filter(Boolean).join("\n\n");
  return { text: stripped, corrected, removed: remaining.map((m) => m.raw) };
}

/** The known prices, for telling the model what it may quote. */
export function describePrices(book, max = 15) {
  if (!book?.prices?.length) return "";
  const seen = new Set();
  const parts = [];
  for (const { value, label, currency } of book.prices) {
    const code = currency || book.currency || "";
    const line = `${label ? `${label}: ` : ""}${formatAmount(value, code || null)}${code ? ` ${code}` : ""}`;
    if (seen.has(line)) continue;
    seen.add(line);
    parts.push(line);
    if (parts.length >= max) break;
  }
  return parts.join("; ");
}

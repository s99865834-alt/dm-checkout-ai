/**
 * Pick a customer-facing contact email for AI replies.
 *
 * Shopify's shop.email is the owner address (often a personal inbox). The
 * address published on a Contact page or in the storefront footer is what
 * merchants actually want handed to customers. Shopify contactEmail (the
 * customer-email setting) is the fallback, then the owner email last.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const SKIP_DOMAINS = new Set([
  "shopify.com",
  "myshopify.com",
  "example.com",
  "email.com",
  "domain.com",
  "sentry.io",
  "wixpress.com",
  "googleapis.com",
  "schema.org",
]);

const SKIP_LOCALS = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "notifications",
  "notify",
  "webmaster",
]);

const PUBLIC_LOCALS = new Set([
  "info",
  "hello",
  "hi",
  "hey",
  "contact",
  "support",
  "help",
  "team",
  "studio",
  "shop",
  "store",
  "sales",
  "orders",
  "order",
  "customerservice",
  "customer-service",
  "customer.service",
  "enquiries",
  "enquiry",
  "inquiry",
  "inquiries",
  "ask",
  "mail",
]);

const IMAGE_OR_ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|ico|js|css)$/i;

const CONTACT_PAGE_RE = /\b(contact|about|faq|help|support)\b/i;

function domainOf(email) {
  return email.split("@")[1] || "";
}

function localOf(email) {
  return email.split("@")[0] || "";
}

function storeHostFrom(host) {
  if (!host) return null;
  return String(host).replace(/^www\./i, "").toLowerCase();
}

function domainMatchesStore(domain, storeHost) {
  if (!storeHost) return false;
  return domain === storeHost || domain.endsWith(`.${storeHost}`);
}

export function isPlausiblePublicEmail(email) {
  if (!email || typeof email !== "string" || !email.includes("@")) return false;
  const lower = email.toLowerCase();
  const domain = domainOf(lower);
  const local = localOf(lower);
  if (IMAGE_OR_ASSET_EXT.test(lower)) return false;
  if (SKIP_LOCALS.has(local)) return false;
  if (SKIP_DOMAINS.has(domain)) return false;
  if ([...SKIP_DOMAINS].some((d) => domain.endsWith(`.${d}`))) return false;
  if (local.length > 64 || domain.length > 255) return false;
  return true;
}

export function extractEmailsFromText(text) {
  if (!text || typeof text !== "string") return [];
  const found = text.match(EMAIL_RE) || [];
  return [...new Set(found.map((e) => e.toLowerCase()))].filter(isPlausiblePublicEmail);
}

export function isContactishPage(page) {
  const blob = `${page?.title || ""} ${page?.handle || ""}`;
  return CONTACT_PAGE_RE.test(blob);
}

function scoreEmail(email, storeHost, { fromContactPage = false, fromFooter = false } = {}) {
  const lower = email.toLowerCase();
  const domain = domainOf(lower);
  const local = localOf(lower);
  let score = 0;
  if (fromContactPage) score += 40;
  if (fromFooter) score += 25;
  if (domainMatchesStore(domain, storeHost)) score += 50;
  if (PUBLIC_LOCALS.has(local)) score += 30;
  else score += 5;
  return score;
}

/**
 * @param {{
 *   pages?: Array<{title?: string, handle?: string, body?: string, bodySummary?: string}>,
 *   homepageHtml?: string,
 *   contactEmail?: string|null,
 *   shopEmail?: string|null,
 *   storeHost?: string|null,
 * }} input
 * @returns {{ email: string|null, source: "page"|"footer"|"contactEmail"|"shopEmail"|null }}
 */
export function resolveCustomerFacingEmail({
  pages = [],
  homepageHtml = "",
  contactEmail = null,
  shopEmail = null,
  storeHost = null,
} = {}) {
  const host = storeHostFrom(storeHost);
  const candidates = [];

  for (const page of pages) {
    const text = page?.bodySummary || page?.body || "";
    const fromContactPage = isContactishPage(page);
    for (const email of extractEmailsFromText(text)) {
      candidates.push({
        email,
        source: "page",
        score: scoreEmail(email, host, { fromContactPage }),
      });
    }
  }

  for (const email of extractEmailsFromText(homepageHtml)) {
    candidates.push({
      email,
      source: "footer",
      score: scoreEmail(email, host, { fromFooter: true }),
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
  if (candidates.length > 0) {
    return { email: candidates[0].email, source: candidates[0].source };
  }

  if (contactEmail && isPlausiblePublicEmail(contactEmail)) {
    return { email: contactEmail.toLowerCase(), source: "contactEmail" };
  }
  if (shopEmail && isPlausiblePublicEmail(shopEmail)) {
    return { email: shopEmail.toLowerCase(), source: "shopEmail" };
  }
  return { email: null, source: null };
}

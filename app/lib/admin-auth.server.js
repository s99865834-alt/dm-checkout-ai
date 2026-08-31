import crypto from "crypto";

const COOKIE_NAME = "admin_session";
const PAYLOAD = "ok";

/**
 * 30 days, re-issued on every authenticated page load (see
 * adminSessionCookieHeader). The previous 24h fixed lifetime meant the session
 * died a day after login no matter how recently it had been used, which reads
 * as "mobile keeps logging me out" simply because the phone is picked up less
 * often than the desktop that gets used daily.
 */
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function getSecret() {
  const secret = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET;
  if (!secret || secret.length < 16) {
    return null;
  }
  return secret;
}

function sign(payload) {
  const secret = getSecret();
  if (!secret) return null;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify admin session from request cookie.
 * Returns true if cookie is present and signature is valid.
 */
export function getAdminSession(request) {
  const secret = getSecret();
  if (!secret) return false;

  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return false;

  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const value = match?.[1]?.trim();
  if (!value) return false;

  const [payload, signature] = value.split(".");
  if (payload !== PAYLOAD || !signature) return false;

  const expected = sign(payload);
  // timingSafeEqual throws on a length mismatch, which a truncated or
  // hand-edited cookie will produce. That would surface as a 500 on every
  // request until the cookie is cleared, so a bad signature has to fail
  // closed as "not logged in" instead.
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * Verify password against ADMIN_PASSWORD.
 */
export function verifyAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || expected.length < 16 || !password) return false;
  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function cookieOptions(includeSecure = true) {
  const secure = includeSecure && process.env.NODE_ENV === "production";
  // Lax, not Strict. Strict withholds the cookie on any cross-site entry
  // navigation, so opening /admin from a phone home-screen shortcut, a
  // messaging app, or a search result arrives logged out even though the
  // session is still valid. Lax still withholds it on cross-site POSTs, which
  // is the CSRF protection that actually matters here.
  return `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * The Set-Cookie value for a fresh admin session.
 * Exposed so authenticated page loads can slide the expiry forward.
 */
export function adminSessionCookieHeader() {
  const signature = sign(PAYLOAD);
  if (!signature) return null;
  return `${COOKIE_NAME}=${PAYLOAD}.${signature}; ${cookieOptions()}; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

/**
 * Set admin session cookie on response.
 * Call this after successful login.
 */
export function setAdminSessionCookie(response) {
  const header = adminSessionCookieHeader();
  if (!header) return response;

  response.headers.append("Set-Cookie", header);
  return response;
}

/**
 * Clear admin session cookie (logout).
 */
export function clearAdminSessionCookie(response) {
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; ${cookieOptions()}; Max-Age=0`
  );
  return response;
}

/**
 * Whether admin auth is configured (ADMIN_PASSWORD set and long enough).
 */
export function isAdminAuthConfigured() {
  return !!getSecret();
}

/**
 * Debug info for 503 responses (no secret values).
 */
export function getAdminAuthDebug() {
  const raw = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || "";
  return {
    ADMIN_PASSWORD_present: !!process.env.ADMIN_PASSWORD,
    ADMIN_SECRET_present: !!process.env.ADMIN_SECRET,
    length: raw.length,
    lengthOk: raw.length >= 16,
  };
}

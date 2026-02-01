import crypto from "crypto";

const COOKIE_NAME = "admin_session";
const PAYLOAD = "ok";

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
  return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
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
  return `Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

/**
 * Set admin session cookie on response.
 * Call this after successful login.
 */
export function setAdminSessionCookie(response) {
  const signature = sign(PAYLOAD);
  if (!signature) return response;

  const value = `${PAYLOAD}.${signature}`;
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${value}; ${cookieOptions()}; Max-Age=86400`
  );
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

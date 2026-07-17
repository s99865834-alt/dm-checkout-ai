/**
 * Founder alert email for new installs / reinstalls.
 *
 * At the current stage every real install should get a personal, same-day
 * onboarding touch from the founder — this makes sure installs are noticed
 * the moment they happen instead of being discovered days later in the
 * admin dashboard.
 *
 * Reuses the Gmail transport already configured for critical-error alerts
 * (GMAIL_USER / GMAIL_APP_PASSWORD / TO_EMAIL). Failures are logged and
 * swallowed — an email problem must never break OAuth.
 */

import nodemailer from "nodemailer";

/**
 * @param {string} shopDomain - e.g. "example.myshopify.com"
 * @param {"install"|"reinstall"} kind
 */
export async function sendInstallAlert(shopDomain, kind = "install") {
  const toEmail = process.env.TO_EMAIL;
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!toEmail || !gmailUser || !gmailAppPassword) return;

  const storeHandle = shopDomain.replace(".myshopify.com", "");
  const label = kind === "reinstall" ? "Reinstall" : "New install";

  const appUrl = (process.env.SHOPIFY_APP_URL || "").trim().replace(/\/$/, "");
  const lines = [
    `${label}: ${shopDomain}`,
    `Time: ${new Date().toISOString()}`,
    "",
    `Storefront (is it a real store?): https://${shopDomain}`,
    `Shopify admin: https://admin.shopify.com/store/${storeHandle}`,
    appUrl ? `Your admin dashboard: ${appUrl}/admin` : null,
    "",
    "Concierge onboarding checklist:",
    "1. Eyeball the storefront — real products, real brand?",
    "2. If real, send the welcome/offer-to-help email today.",
    "3. Watch for Instagram connection in the admin dashboard.",
  ].filter((l) => l !== null);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });

  await transporter.sendMail({
    from: gmailUser,
    to: toEmail,
    subject: `${kind === "reinstall" ? "🔄" : "🎉"} ${label}: ${shopDomain}`,
    text: lines.join("\n"),
  });
}

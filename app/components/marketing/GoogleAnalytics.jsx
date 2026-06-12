/**
 * GA4 for the public marketing pages only (never the embedded admin app).
 * Renders nothing unless a measurement ID is configured, so local dev and
 * preview deploys stay tracker-free.
 *
 * Besides standard pageviews, a delegated click listener fires an
 * "app_store_click" event for any link to the Shopify App Store listing —
 * the conversion that matters on this site.
 */
export function GoogleAnalytics({ gaId }) {
  if (!gaId) return null;

  const inline = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a') : null;
  if (a && a.href && a.href.indexOf('apps.shopify.com') !== -1) {
    gtag('event', 'app_store_click', {
      link_url: a.href,
      page_path: window.location.pathname,
    });
  }
}, true);
`;

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
      <script dangerouslySetInnerHTML={{ __html: inline }} />
    </>
  );
}

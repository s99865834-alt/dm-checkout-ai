// Read-only home actions must not re-run the loader. The first-load
// message-access re-check used to POST, revalidate, and abandon the in-flight
// Instagram feed. Pagination and product search have the same problem.
const HOME_FEED_ACTIONS_NO_REVALIDATE = new Set([
  "load-home-feed",
  "load-more-media",
  "search-products",
  "check-message-access",
  "record-review-prompt",
]);

export function shouldRevalidate({ formData, defaultShouldRevalidate }) {
  const actionType = formData?.get?.("action");
  if (actionType && HOME_FEED_ACTIONS_NO_REVALIDATE.has(actionType)) {
    return false;
  }
  return defaultShouldRevalidate;
}

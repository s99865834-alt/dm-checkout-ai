// Read-only home actions must not re-run the loader. The first-load
// message-access re-check used to POST, revalidate, and abandon the in-flight
// Instagram feed. Pagination and product search have the same problem.
const HOME_FEED_ACTIONS_NO_REVALIDATE = new Set([
  "load-home-feed",
  "load-more-media",
  "search-products",
  "check-message-access",
  "load-trial-status",
  "record-review-prompt",
]);

export function isReadOnlyHomeAction(formData) {
  const actionType = formData?.get?.("action");
  return Boolean(actionType && HOME_FEED_ACTIONS_NO_REVALIDATE.has(actionType));
}

// The app layout's shop/plan only change through writes (billing, Instagram
// connect/disconnect), so it skips read-only home actions and plain navigation.
export function layoutShouldRevalidate({ formMethod, formData }) {
  if (isReadOnlyHomeAction(formData)) return false;
  return Boolean(formMethod && formMethod.toUpperCase() !== "GET");
}

export function shouldRevalidate({ formData, defaultShouldRevalidate }) {
  if (isReadOnlyHomeAction(formData)) return false;
  return defaultShouldRevalidate;
}

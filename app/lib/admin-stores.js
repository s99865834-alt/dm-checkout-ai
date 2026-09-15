export const ADMIN_STORES_PAGE_SIZE = 50;

export function sanitizeAdminStoreSearch(q) {
  if (!q || typeof q !== "string") return "";
  return q.replace(/[%_,()]/g, "").trim().slice(0, 80);
}

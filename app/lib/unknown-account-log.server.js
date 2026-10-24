/**
 * Report an inbound Meta event for an account we have no shop for, once.
 *
 * Both disconnect (deleteMetaAuth) and uninstall ask Meta to stop sending an
 * account's events, but that call authenticates with the account's own token.
 * An account whose token we lost before unsubscribing therefore keeps
 * delivering and there is nothing left on our side that can stop it.
 *
 * That is worth saying, because it means a former merchant's customer
 * conversations are still arriving. It is worth saying exactly once, because
 * Meta then sends every DM and comment on that account indefinitely, and by
 * 24 Oct 2026 the repeats were the loudest thing in the production log while
 * telling you nothing the first line hadn't.
 */
import logger from "./logger.server";

const reported = new Set();

/**
 * @param {string} field - identifier name, e.g. "ig_business_id" or "page_id"
 * @param {string|number|null} id - the account identifier from the event
 * @returns {boolean} true when this was the first report for that account
 */
export function noteUnknownAccount(field, id) {
  const key = `${field}=${id}`;
  const line = `[webhook] No shop for ${key}, skipping`;

  if (reported.has(key)) {
    logger.debug(line);
    return false;
  }

  reported.add(key);
  console.warn(`${line}. Further events from this account are logged at debug only.`);
  return true;
}

/** Test seam. Production never needs to forget an account mid-process. */
export function resetUnknownAccountLog() {
  reported.clear();
}

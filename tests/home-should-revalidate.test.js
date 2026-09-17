import { describe, expect, it } from "vitest";
import { shouldRevalidate } from "../app/routes/app._index.jsx";

function formDataWith(action) {
  return {
    get(key) {
      return key === "action" ? action : null;
    },
  };
}

describe("home shouldRevalidate", () => {
  it("does not re-run the loader for feed and probe actions", () => {
    for (const action of [
      "load-home-feed",
      "load-more-media",
      "search-products",
      "check-message-access",
      "record-review-prompt",
    ]) {
      expect(shouldRevalidate({ formData: formDataWith(action), defaultShouldRevalidate: true })).toBe(false);
    }
  });

  it("still revalidates after settings and mapping writes", () => {
    expect(
      shouldRevalidate({
        formData: formDataWith("update-automation-settings"),
        defaultShouldRevalidate: true,
      }),
    ).toBe(true);
    expect(
      shouldRevalidate({
        formData: formDataWith("save-mapping"),
        defaultShouldRevalidate: true,
      }),
    ).toBe(true);
  });
});

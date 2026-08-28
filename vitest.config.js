import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    environment: "node",
    // Fake env so server modules can load without real credentials. External
    // services (OpenAI, Supabase, Meta, Shopify Admin) are mocked in the tests
    // themselves — nothing here talks to the network.
    env: {
      OPENAI_API_KEY: "test-key",
      SHORT_LINK_DOMAIN: "https://short.test",
      // crypto.server requires a 32-byte key at import time. Not base64, so it
      // falls through to the utf8 branch and lands on exactly 32 bytes.
      ENCRYPTION_KEY_32B: "a".repeat(32),
    },
  },
});

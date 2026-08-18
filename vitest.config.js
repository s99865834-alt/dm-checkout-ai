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
    },
  },
});

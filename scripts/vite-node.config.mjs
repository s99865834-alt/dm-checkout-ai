/**
 * Minimal Vite config for running one-off scripts with vite-node
 * (e.g. scripts/test-sales-agent.mjs). Disables file watching (chokidar hits
 * EMFILE on large repos) and skips the app's react-router plugin, which is
 * irrelevant outside the web build.
 */
export default {
  server: { watch: null },
  plugins: [],
};

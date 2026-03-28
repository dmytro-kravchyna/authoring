// Use /tmp for data storage in Vercel serverless (ephemeral but writable).
// Must be set before any store-server modules are imported (they read it at
// the top level), so we use a dynamic import() instead of a static one.
if (!process.env.STORE_DATA_DIR) {
  process.env.STORE_DATA_DIR = "/tmp/store-data";
}

const { createApp } = await import("../packages/store-server/src/index.js");

const app = createApp();

export default app;

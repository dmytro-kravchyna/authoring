// Use /tmp for data storage in Vercel serverless (ephemeral but writable)
if (!process.env.STORE_DATA_DIR) {
  process.env.STORE_DATA_DIR = "/tmp/store-data";
}

import { createApp } from "../packages/store-server/src/index.js";

const app = createApp();

export default app;

import express from "express";
import cors from "cors";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import extensionsRouter from "./routes/extensions.js";
import authorsRouter from "./routes/authors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const STORE_DATA = process.env.STORE_DATA_DIR || join(__dirname, "../store-data");

  // Ensure data directories exist
  for (const dir of [STORE_DATA, join(STORE_DATA, "packages"), join(STORE_DATA, "tmp")]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const app = express();

  app.use(cors());
  app.use(express.json());

  // API routes
  app.use("/api/extensions", extensionsRouter);
  app.use("/api/authors", authorsRouter);

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0" });
  });

  return app;
}

// Start server when run directly
const isMain = !process.env.VITEST && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const app = createApp();
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`BIM IDE Extension Store running at http://localhost:${PORT}`);
    console.log(`  API: http://localhost:${PORT}/api/extensions`);
    console.log(`  Health: http://localhost:${PORT}/api/health`);
  });
}

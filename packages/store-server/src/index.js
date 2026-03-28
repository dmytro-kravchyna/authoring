import express from "express";
import cors from "cors";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import extensionsRouter from "./routes/extensions.js";
import authorsRouter from "./routes/authors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_DATA = join(__dirname, "../store-data");

// Ensure data directories exist
for (const dir of [STORE_DATA, join(STORE_DATA, "packages"), join(STORE_DATA, "tmp")]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// API routes
app.use("/api/extensions", extensionsRouter);
app.use("/api/authors", authorsRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "0.1.0" });
});

app.listen(PORT, () => {
  console.log(`BIM IDE Extension Store running at http://localhost:${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api/extensions`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
});

import { Router } from "express";
import { getDatabase } from "../db/database.js";
import multer from "multer";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_DATA = join(__dirname, "../../store-data/packages");

// Ensure storage directory exists
if (!existsSync(STORE_DATA)) {
  mkdirSync(STORE_DATA, { recursive: true });
}

const upload = multer({ dest: join(__dirname, "../../store-data/tmp") });

const router = Router();

// List / search extensions
router.get("/", (req, res) => {
  const db = getDatabase();
  const { q, sort = "downloads", category } = req.query;

  let sql = "SELECT * FROM extensions";
  const params = [];
  const conditions = [];

  if (q) {
    conditions.push("(name LIKE ? OR description LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  if (category) {
    conditions.push("tags LIKE ?");
    params.push(`%"${category}"%`);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  const sortMap = {
    downloads: "downloads DESC",
    rating: "CASE WHEN rating_count > 0 THEN rating_sum / rating_count ELSE 0 END DESC",
    recent: "updated_at DESC",
    name: "name ASC",
  };
  sql += ` ORDER BY ${sortMap[sort] || "downloads DESC"}`;

  const rows = db.prepare(sql).all(...params);

  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      description: row.description,
      author: row.author,
      downloads: row.downloads,
      rating: row.rating_count > 0 ? row.rating_sum / row.rating_count : 0,
      tags: JSON.parse(row.tags || "[]"),
    }))
  );
});

// Get extension details
router.get("/:id", (req, res) => {
  const db = getDatabase();
  const row = db.prepare("SELECT * FROM extensions WHERE id = ?").get(req.params.id);

  if (!row) {
    return res.status(404).json({ error: "Extension not found" });
  }

  const versions = db
    .prepare("SELECT version, published_at FROM versions WHERE extension_id = ? ORDER BY published_at DESC")
    .all(req.params.id);

  res.json({
    ...row,
    manifest: JSON.parse(row.manifest),
    tags: JSON.parse(row.tags || "[]"),
    versions,
    rating: row.rating_count > 0 ? row.rating_sum / row.rating_count : 0,
  });
});

// Publish extension
router.post("/", upload.single("bundle"), (req, res) => {
  const db = getDatabase();

  try {
    const manifest = JSON.parse(req.body.manifest);
    const { id, name, version, description = "", author = "", license = "MIT" } = manifest;

    if (!id || !name || !version) {
      return res.status(400).json({ error: "Manifest must include id, name, and version" });
    }

    // Check if extension exists
    const existing = db.prepare("SELECT id FROM extensions WHERE id = ?").get(id);

    if (existing) {
      // Update
      db.prepare(
        "UPDATE extensions SET name = ?, version = ?, description = ?, author = ?, manifest = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(name, version, description, author, JSON.stringify(manifest), id);
    } else {
      // Insert
      db.prepare(
        "INSERT INTO extensions (id, name, version, description, author, license, manifest) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(id, name, version, description, author, license, JSON.stringify(manifest));
    }

    // Store version record
    const bundlePath = req.file ? req.file.path : "";
    db.prepare(
      "INSERT OR REPLACE INTO versions (extension_id, version, bundle_path, manifest) VALUES (?, ?, ?, ?)"
    ).run(id, version, bundlePath, JSON.stringify(manifest));

    res.json({ success: true, id, version });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Download extension
router.get("/:id/download", (req, res) => {
  const db = getDatabase();
  const ext = db.prepare("SELECT * FROM extensions WHERE id = ?").get(req.params.id);

  if (!ext) {
    return res.status(404).json({ error: "Extension not found" });
  }

  // Increment download count
  db.prepare("UPDATE extensions SET downloads = downloads + 1 WHERE id = ?").run(req.params.id);

  // Get latest version
  const ver = db
    .prepare("SELECT * FROM versions WHERE extension_id = ? ORDER BY published_at DESC LIMIT 1")
    .get(req.params.id);

  if (!ver || !ver.bundle_path) {
    return res.status(404).json({ error: "No bundle available" });
  }

  res.download(ver.bundle_path);
});

// Submit rating
router.post("/:id/ratings", (req, res) => {
  const db = getDatabase();
  const { user_id, rating, review = "" } = req.body;

  if (!user_id || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Invalid rating (1-5) or missing user_id" });
  }

  const ext = db.prepare("SELECT id FROM extensions WHERE id = ?").get(req.params.id);
  if (!ext) {
    return res.status(404).json({ error: "Extension not found" });
  }

  // Upsert rating
  const existing = db
    .prepare("SELECT rating FROM ratings WHERE extension_id = ? AND user_id = ?")
    .get(req.params.id, user_id);

  if (existing) {
    // Update
    db.prepare("UPDATE ratings SET rating = ?, review = ? WHERE extension_id = ? AND user_id = ?").run(
      rating,
      review,
      req.params.id,
      user_id
    );
    // Adjust sum
    db.prepare("UPDATE extensions SET rating_sum = rating_sum - ? + ? WHERE id = ?").run(
      existing.rating,
      rating,
      req.params.id
    );
  } else {
    // Insert
    db.prepare("INSERT INTO ratings (extension_id, user_id, rating, review) VALUES (?, ?, ?, ?)").run(
      req.params.id,
      user_id,
      rating,
      review
    );
    db.prepare("UPDATE extensions SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?").run(
      rating,
      req.params.id
    );
  }

  res.json({ success: true });
});

// Get categories
router.get("/meta/categories", (_req, res) => {
  res.json([
    { id: "elements", name: "BIM Elements", description: "New building element types" },
    { id: "tools", name: "Modeling Tools", description: "Interactive modeling tools" },
    { id: "analysis", name: "Analysis", description: "Structural, energy, cost analysis" },
    { id: "export", name: "Import/Export", description: "File format converters" },
    { id: "ai-skills", name: "AI Skills", description: "AI domain knowledge extensions" },
    { id: "visualization", name: "Visualization", description: "Rendering and presentation" },
  ]);
});

export default router;

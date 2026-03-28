import { Router } from "express";
import { getDatabase, syncContributions } from "../db/database.js";
import multer from "multer";
import { mkdirSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORE_DATA = process.env.STORE_DATA_DIR
  ? join(process.env.STORE_DATA_DIR, "packages")
  : join(__dirname, "../../store-data/packages");

// Ensure storage directory exists
if (!existsSync(STORE_DATA)) {
  mkdirSync(STORE_DATA, { recursive: true });
}

const uploadDest = process.env.STORE_DATA_DIR
  ? join(process.env.STORE_DATA_DIR, "tmp")
  : join(__dirname, "../../store-data/tmp");
const upload = multer({ dest: uploadDest });

const router = Router();

// List / search extensions
router.get("/", (req, res) => {
  const db = getDatabase();
  const { q, sort = "downloads", category, author, contribution_type } = req.query;

  const params = [];
  const conditions = [];
  let extraJoin = "";

  if (contribution_type) {
    extraJoin = " JOIN extension_contributions ec ON e.id = ec.extension_id";
    conditions.push("ec.type = ?");
    params.push(contribution_type);
  }

  if (q) {
    conditions.push("(e.name LIKE ? OR e.description LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }

  if (category) {
    conditions.push("(e.category = ? OR e.tags LIKE ?)");
    params.push(category, `%"${category}"%`);
  }

  if (author) {
    conditions.push("(a.name = ? OR a.id = ?)");
    params.push(author, author);
  }

  let sql = `SELECT DISTINCT e.*, a.display_name AS author_name, a.avatar_url AS author_avatar
             FROM extensions e
             LEFT JOIN authors a ON e.author_id = a.id${extraJoin}`;

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  const sortMap = {
    downloads: "e.downloads DESC",
    rating: "CASE WHEN e.rating_count > 0 THEN e.rating_sum / e.rating_count ELSE 0 END DESC",
    recent: "e.updated_at DESC",
    name: "e.name ASC",
  };
  sql += ` ORDER BY ${sortMap[sort] || "e.downloads DESC"}`;

  const rows = db.prepare(sql).all(...params);

  res.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      description: row.description,
      author: row.author_name || row.author,
      author_id: row.author_id || null,
      author_avatar: row.author_avatar || null,
      downloads: row.downloads,
      rating: row.rating_count > 0 ? row.rating_sum / row.rating_count : 0,
      tags: JSON.parse(row.tags || "[]"),
      category: row.category || null,
      icon_url: row.icon_url || null,
      undo_aware: !!row.undo_aware,
    }))
  );
});

// Get extension details
router.get("/:id", (req, res) => {
  const db = getDatabase();

  const row = db
    .prepare(
      `SELECT e.*, a.display_name AS author_name, a.avatar_url AS author_avatar,
              a.email AS author_email, a.url AS author_url, a.org AS author_org,
              a.verified AS author_verified
       FROM extensions e
       LEFT JOIN authors a ON e.author_id = a.id
       WHERE e.id = ?`
    )
    .get(req.params.id);

  if (!row) {
    return res.status(404).json({ error: "Extension not found" });
  }

  const versions = db
    .prepare(
      "SELECT version, changelog, min_app_version, published_at FROM versions WHERE extension_id = ? ORDER BY published_at DESC"
    )
    .all(req.params.id);

  const contributions = db
    .prepare(
      "SELECT type, key, label, category, icon, location, metadata FROM extension_contributions WHERE extension_id = ?"
    )
    .all(req.params.id);

  const dependencies = db
    .prepare(
      "SELECT dependency_id, version_constraint FROM extension_dependencies WHERE extension_id = ?"
    )
    .all(req.params.id);

  // Build author detail if linked
  let author_detail = null;
  if (row.author_id) {
    author_detail = {
      id: row.author_id,
      display_name: row.author_name,
      avatar_url: row.author_avatar || "",
      email: row.author_email || "",
      url: row.author_url || "",
      org: row.author_org || "",
      verified: !!row.author_verified,
    };
  }

  res.json({
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description,
    author: row.author_name || row.author,
    author_detail,
    license: row.license,
    manifest: JSON.parse(row.manifest),
    readme: row.readme,
    downloads: row.downloads,
    rating: row.rating_count > 0 ? row.rating_sum / row.rating_count : 0,
    rating_count: row.rating_count,
    tags: JSON.parse(row.tags || "[]"),
    versions,
    contributions: contributions.map((c) => ({
      ...c,
      metadata: JSON.parse(c.metadata || "{}"),
    })),
    dependencies,
    entry_point: row.entry_point || "",
    bundle_hash: row.bundle_hash || "",
    permissions: JSON.parse(row.permissions || "[]"),
    min_app_version: row.min_app_version || "",
    icon_url: row.icon_url || "",
    repository_url: row.repository_url || "",
    category: row.category || "",
    undo_aware: !!row.undo_aware,
    action_categories: JSON.parse(row.action_categories || "[]"),
  });
});

// Publish extension
router.post("/", upload.single("bundle"), (req, res) => {
  const db = getDatabase();

  try {
    const manifest = JSON.parse(req.body.manifest);
    const {
      id, name, version,
      description = "", author = "", license = "MIT",
      author_id = null, main = "", permissions = [],
      min_app_version = "", icon_url = "", repository_url = "",
      category = "", undoAware = false, actionCategories = [],
      readme = "",
    } = manifest;

    if (!id || !name || !version) {
      return res.status(400).json({ error: "Manifest must include id, name, and version" });
    }

    // Compute bundle hash if file provided
    let bundleHash = "";
    if (req.file) {
      const fileBuffer = readFileSync(req.file.path);
      bundleHash = createHash("sha256").update(fileBuffer).digest("hex");
    }

    const existing = db.prepare("SELECT id FROM extensions WHERE id = ?").get(id);

    if (existing) {
      db.prepare(
        `UPDATE extensions SET
           name = ?, version = ?, description = ?, author = ?, author_id = ?,
           manifest = ?, entry_point = ?, bundle_hash = ?, permissions = ?,
           min_app_version = ?, icon_url = ?, repository_url = ?, category = ?,
           undo_aware = ?, action_categories = ?, readme = ?,
           updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        name, version, description, author, author_id,
        JSON.stringify(manifest), main, bundleHash, JSON.stringify(permissions),
        min_app_version, icon_url, repository_url, category,
        undoAware ? 1 : 0, JSON.stringify(actionCategories), readme, id
      );
    } else {
      db.prepare(
        `INSERT INTO extensions
           (id, name, version, description, author, author_id, license, manifest,
            entry_point, bundle_hash, permissions, min_app_version, icon_url,
            repository_url, category, undo_aware, action_categories, readme)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, name, version, description, author, author_id, license, JSON.stringify(manifest),
        main, bundleHash, JSON.stringify(permissions), min_app_version, icon_url,
        repository_url, category, undoAware ? 1 : 0, JSON.stringify(actionCategories), readme
      );
    }

    // Store version record
    const bundlePath = req.file ? req.file.path : "";
    db.prepare(
      `INSERT OR REPLACE INTO versions
         (extension_id, version, bundle_path, manifest, bundle_hash, changelog, min_app_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, version, bundlePath, JSON.stringify(manifest),
      bundleHash, manifest.changelog || "", min_app_version
    );

    // Sync queryable contributions table
    syncContributions(db, id, manifest);

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

  // Get the version matching the current extension version (set on publish)
  const ver = db
    .prepare("SELECT * FROM versions WHERE extension_id = ? AND version = ?")
    .get(req.params.id, ext.version);

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
    db.prepare("UPDATE ratings SET rating = ?, review = ? WHERE extension_id = ? AND user_id = ?").run(
      rating, review, req.params.id, user_id
    );
    db.prepare("UPDATE extensions SET rating_sum = rating_sum - ? + ? WHERE id = ?").run(
      existing.rating, rating, req.params.id
    );
  } else {
    db.prepare("INSERT INTO ratings (extension_id, user_id, rating, review) VALUES (?, ?, ?, ?)").run(
      req.params.id, user_id, rating, review
    );
    db.prepare("UPDATE extensions SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?").run(
      rating, req.params.id
    );
  }

  res.json({ success: true });
});

// Get categories (with counts from DB)
router.get("/meta/categories", (_req, res) => {
  const db = getDatabase();

  const counts = db
    .prepare("SELECT category, COUNT(*) as count FROM extensions WHERE category != '' GROUP BY category")
    .all();
  const countMap = Object.fromEntries(counts.map((c) => [c.category, c.count]));

  const categories = [
    { id: "elements", name: "BIM Elements", description: "New building element types" },
    { id: "tools", name: "Modeling Tools", description: "Interactive modeling tools" },
    { id: "analysis", name: "Analysis", description: "Structural, energy, cost analysis" },
    { id: "export", name: "Import/Export", description: "File format converters" },
    { id: "ai-skills", name: "AI Skills", description: "AI domain knowledge extensions" },
    { id: "visualization", name: "Visualization", description: "Rendering and presentation" },
  ];

  res.json(categories.map((c) => ({ ...c, count: countMap[c.id] || 0 })));
});

export default router;

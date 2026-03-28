import { Router } from "express";
import { getDatabase } from "../db/database.js";

const router = Router();

// List all authors with extension counts
router.get("/", (_req, res) => {
  const db = getDatabase();

  const rows = db
    .prepare(
      `SELECT a.*, COUNT(e.id) AS extension_count
       FROM authors a
       LEFT JOIN extensions e ON e.author_id = a.id
       GROUP BY a.id
       ORDER BY extension_count DESC`
    )
    .all();

  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      display_name: r.display_name,
      org: r.org,
      avatar_url: r.avatar_url || "",
      verified: !!r.verified,
      extension_count: r.extension_count,
    }))
  );
});

// Get author detail with their extensions
router.get("/:id", (req, res) => {
  const db = getDatabase();

  const author = db.prepare("SELECT * FROM authors WHERE id = ? OR name = ?").get(req.params.id, req.params.id);
  if (!author) {
    return res.status(404).json({ error: "Author not found" });
  }

  const extensions = db
    .prepare(
      `SELECT id, name, version, description, downloads, category,
              CASE WHEN rating_count > 0 THEN rating_sum / rating_count ELSE 0 END AS rating
       FROM extensions WHERE author_id = ? ORDER BY downloads DESC`
    )
    .all(author.id);

  res.json({
    id: author.id,
    name: author.name,
    display_name: author.display_name,
    email: author.email,
    url: author.url,
    avatar_url: author.avatar_url || "",
    org: author.org,
    verified: !!author.verified,
    created_at: author.created_at,
    extensions,
  });
});

// Create or update author
router.post("/", (req, res) => {
  const db = getDatabase();
  const { id, name, display_name, email = "", url = "", avatar_url = "", org = "" } = req.body;

  if (!id || !name || !display_name) {
    return res.status(400).json({ error: "id, name, and display_name are required" });
  }

  const existing = db.prepare("SELECT id FROM authors WHERE id = ?").get(id);

  if (existing) {
    db.prepare(
      "UPDATE authors SET name = ?, display_name = ?, email = ?, url = ?, avatar_url = ?, org = ? WHERE id = ?"
    ).run(name, display_name, email, url, avatar_url, org, id);
  } else {
    db.prepare(
      "INSERT INTO authors (id, name, display_name, email, url, avatar_url, org) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, name, display_name, email, url, avatar_url, org);
  }

  res.json({ success: true, id });
});

export default router;

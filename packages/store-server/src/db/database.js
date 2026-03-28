import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

/**
 * Check whether a column exists on a table.
 */
function hasColumn(database, table, column) {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

/**
 * Add columns that were introduced after the initial schema.
 * Safe to run repeatedly — skips columns that already exist.
 */
function migrateSchema(database) {
  const extensionCols = [
    ["author_id", "TEXT DEFAULT NULL"],
    ["entry_point", "TEXT DEFAULT ''"],
    ["bundle_hash", "TEXT DEFAULT ''"],
    ["permissions", "TEXT DEFAULT '[]'"],
    ["min_app_version", "TEXT DEFAULT ''"],
    ["icon_url", "TEXT DEFAULT ''"],
    ["repository_url", "TEXT DEFAULT ''"],
    ["category", "TEXT DEFAULT ''"],
    ["undo_aware", "INTEGER DEFAULT 0"],
    ["action_categories", "TEXT DEFAULT '[]'"],
  ];
  for (const [col, def] of extensionCols) {
    if (!hasColumn(database, "extensions", col)) {
      database.exec(`ALTER TABLE extensions ADD COLUMN ${col} ${def}`);
    }
  }

  const versionCols = [
    ["bundle_hash", "TEXT DEFAULT ''"],
    ["changelog", "TEXT DEFAULT ''"],
    ["min_app_version", "TEXT DEFAULT ''"],
  ];
  for (const [col, def] of versionCols) {
    if (!hasColumn(database, "versions", col)) {
      database.exec(`ALTER TABLE versions ADD COLUMN ${col} ${def}`);
    }
  }
}

export function resetDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export function getDatabase() {
  if (!db) {
    const dataDir = process.env.STORE_DATA_DIR || join(__dirname, "../../store-data");
    db = new DatabaseSync(join(dataDir, "store.db"));
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");

    // Run base schema (CREATE TABLE IF NOT EXISTS)
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    db.exec(schema);

    // Add any new columns to existing tables
    migrateSchema(db);
  }
  return db;
}

/**
 * Rebuild the extension_contributions rows from a parsed manifest.
 * Called on every publish so the queryable table stays in sync with the manifest JSON.
 */
export function syncContributions(database, extensionId, manifest) {
  database
    .prepare("DELETE FROM extension_contributions WHERE extension_id = ?")
    .run(extensionId);

  const contrib = manifest.contributes;
  if (!contrib) return;

  const insert = database.prepare(
    `INSERT INTO extension_contributions
       (extension_id, type, key, label, category, icon, location, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  if (contrib.elements) {
    for (const el of contrib.elements) {
      insert.run(
        extensionId, "element", el.kind, el.kind,
        "", "", "",
        JSON.stringify({ entrypoint: el.entrypoint })
      );
    }
  }

  if (contrib.tools) {
    for (const t of contrib.tools) {
      insert.run(
        extensionId, "tool", t.id, t.label,
        t.category || "", t.icon || "", "",
        JSON.stringify({ entrypoint: t.entrypoint })
      );
    }
  }

  if (contrib.commands) {
    for (const c of contrib.commands) {
      insert.run(
        extensionId, "command", c.id, c.label,
        c.category || "", "", "",
        JSON.stringify({ keybinding: c.keybinding || "" })
      );
    }
  }

  if (contrib.views) {
    for (const v of contrib.views) {
      insert.run(
        extensionId, "view", v.id, v.label,
        "", "", v.location || "",
        JSON.stringify({ entrypoint: v.entrypoint })
      );
    }
  }

  if (contrib.wiki) {
    for (const w of contrib.wiki) {
      insert.run(
        extensionId, "wiki", w.path, w.title,
        w.category || "", "", "",
        "{}"
      );
    }
  }

  if (contrib.aiSkills) {
    for (const s of contrib.aiSkills) {
      insert.run(
        extensionId, "ai_skill", s.id, s.name,
        "", "", "",
        JSON.stringify({ description: s.description || "", entrypoint: s.entrypoint })
      );
    }
  }
}

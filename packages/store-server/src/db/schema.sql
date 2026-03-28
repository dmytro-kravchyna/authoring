-- ── Core tables ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS authors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  url TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  org TEXT DEFAULT '',
  verified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT DEFAULT '',
  author TEXT DEFAULT '',
  author_id TEXT,
  license TEXT DEFAULT 'MIT',
  manifest TEXT NOT NULL,
  readme TEXT DEFAULT '',
  downloads INTEGER DEFAULT 0,
  rating_sum REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',
  entry_point TEXT DEFAULT '',
  bundle_hash TEXT DEFAULT '',
  permissions TEXT DEFAULT '[]',
  min_app_version TEXT DEFAULT '',
  icon_url TEXT DEFAULT '',
  repository_url TEXT DEFAULT '',
  category TEXT DEFAULT '',
  undo_aware INTEGER DEFAULT 0,
  action_categories TEXT DEFAULT '[]',
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (author_id) REFERENCES authors(id)
);

CREATE TABLE IF NOT EXISTS versions (
  extension_id TEXT NOT NULL,
  version TEXT NOT NULL,
  bundle_path TEXT NOT NULL,
  manifest TEXT NOT NULL,
  bundle_hash TEXT DEFAULT '',
  changelog TEXT DEFAULT '',
  min_app_version TEXT DEFAULT '',
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (extension_id, version),
  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ratings (
  extension_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  review TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (extension_id, user_id),
  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE
);

-- ── Contribution & dependency tables ─────────────────

CREATE TABLE IF NOT EXISTS extension_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  extension_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('element','tool','command','view','wiki','ai_skill')),
  key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  category TEXT DEFAULT '',
  icon TEXT DEFAULT '',
  location TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
  UNIQUE (extension_id, type, key)
);

CREATE INDEX IF NOT EXISTS idx_contributions_type ON extension_contributions(type);
CREATE INDEX IF NOT EXISTS idx_contributions_ext ON extension_contributions(extension_id);

CREATE TABLE IF NOT EXISTS extension_dependencies (
  extension_id TEXT NOT NULL,
  dependency_id TEXT NOT NULL,
  version_constraint TEXT NOT NULL DEFAULT '*',
  PRIMARY KEY (extension_id, dependency_id),
  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS extensions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  description TEXT DEFAULT '',
  author TEXT DEFAULT '',
  license TEXT DEFAULT 'MIT',
  manifest TEXT NOT NULL,
  readme TEXT DEFAULT '',
  downloads INTEGER DEFAULT 0,
  rating_sum REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS versions (
  extension_id TEXT NOT NULL,
  version TEXT NOT NULL,
  bundle_path TEXT NOT NULL,
  manifest TEXT NOT NULL,
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

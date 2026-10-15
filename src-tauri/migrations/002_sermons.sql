CREATE TABLE IF NOT EXISTS sermons (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  document TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

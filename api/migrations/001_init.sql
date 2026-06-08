-- migrations/001_init.sql (SQLite / better-sqlite3)
--
-- AUTH_FEATURE.md の PostgreSQL スキーマを SQLite 用に読み替えたもの。
-- 主な差分:
--   TIMESTAMPTZ        → TEXT  (ISO8601 文字列。アプリ側で new Date().toISOString())
--   BOOLEAN            → INTEGER (0/1) + CHECK 制約
--   GENERATED ALWAYS AS → 廃止。email_normalized は INSERT/UPDATE 時に小文字化して格納
--   BIGSERIAL          → INTEGER PRIMARY KEY AUTOINCREMENT
--   NOW()              → アプリ側で生成(将来 PostgreSQL へ移行しやすくするため)
--
-- 外部キー制約は SQLite では既定で無効なので、接続時に
--   PRAGMA foreign_keys = ON;
-- を db.ts で必ず実行すること。

CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  email_normalized      TEXT NOT NULL,
  name                  TEXT NOT NULL,
  password_hash         TEXT,
  role                  TEXT NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('sysadmin', 'editor', 'viewer')),
  department            TEXT,
  title                 TEXT,
  email_verified_at     TEXT,
  must_change_password  INTEGER NOT NULL DEFAULT 0
                          CHECK (must_change_password IN (0, 1)),
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_normalized
  ON users(email_normalized);

CREATE TABLE IF NOT EXISTS email_verifications (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user
  ON email_verifications(user_id);

-- 将来用(パスワード忘れリセット)
CREATE TABLE IF NOT EXISTS password_resets (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user
  ON password_resets(user_id);

-- ブルートフォース対策(直近の失敗回数で 429 を返す)
CREATE TABLE IF NOT EXISTS login_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL,
  ip            TEXT,
  success       INTEGER NOT NULL CHECK (success IN (0, 1)),
  attempted_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time
  ON login_attempts(email, attempted_at DESC);

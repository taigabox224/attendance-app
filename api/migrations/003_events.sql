-- イベント本体と参加者・受付担当の関連テーブル。
--
-- 設計メモ:
--   - 日時は ISO8601 文字列 (TEXT) で保持。アプリ側で new Date().toISOString()
--   - boolean は INTEGER (0/1) + CHECK 制約。
--   - 二次会は events 行内のオプショナルカラムで持つ (関連テーブル化しない)。
--     Phase 1 の構造に揃え、本実装でも事実上 1:0..1 関係なので INNER で十分。
--   - event_attendees はゲスト (オブザーバー) も同テーブルで扱う。
--     ゲストは user_id NULL + is_observer=1 + observer_name に表示名を入れる。
--   - 「同じユーザーが同じイベントに 2 行存在」しないよう、user_id NOT NULL の
--     行に対してのみユニーク制約を付与 (SQLite の partial index)。
--   - event_receptionists は受付担当の M:N。
--
-- 連動削除:
--   ON DELETE CASCADE で events 削除時に attendees / receptionists も消える。
--   users 削除時は、その user が attendees / receptionists の行を持っていれば
--   それらも消える (運用上の脱会対応はソフト削除を後で導入する)。

CREATE TABLE IF NOT EXISTS events (
  id                       TEXT PRIMARY KEY,
  title                    TEXT NOT NULL,
  start_at                 TEXT NOT NULL,
  end_at                   TEXT,
  response_deadline        TEXT,
  committee                TEXT,
  location                 TEXT,
  description              TEXT,
  created_by               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  published                INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  has_afterparty           INTEGER NOT NULL DEFAULT 0 CHECK (has_afterparty IN (0, 1)),
  afterparty_title         TEXT,
  afterparty_location      TEXT,
  afterparty_description   TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_start_at
  ON events(start_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_published_start
  ON events(published, start_at DESC);

CREATE TABLE IF NOT EXISTS event_attendees (
  id              TEXT PRIMARY KEY,
  event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
  is_observer     INTEGER NOT NULL DEFAULT 0 CHECK (is_observer IN (0, 1)),
  observer_name   TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'yes', 'no')),
  after_status    TEXT CHECK (after_status IN ('pending', 'yes', 'no')),
  checked_in_at   TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_attendees_event_user
  ON event_attendees(event_id, user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_attendees_event
  ON event_attendees(event_id);

CREATE INDEX IF NOT EXISTS idx_event_attendees_user
  ON event_attendees(user_id);

CREATE TABLE IF NOT EXISTS event_receptionists (
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

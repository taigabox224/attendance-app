-- 参加者プリセットリスト (理事会メンバー等の使い回し集合)。
-- Phase 1 の state.attendeeLists 相当。
--
-- attendee_lists: リスト本体 (id, 名前, 作成者)
-- attendee_list_members: 各リストに含まれる user_id (M:N)
--
-- ON DELETE CASCADE で users / lists 側の削除に追随する。

CREATE TABLE IF NOT EXISTS attendee_lists (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendee_list_members (
  list_id     TEXT NOT NULL REFERENCES attendee_lists(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (list_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_attendee_list_members_list
  ON attendee_list_members(list_id);

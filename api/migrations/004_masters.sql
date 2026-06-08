-- 委員会 / 役職 のマスター。Phase 1 の state.departments / state.titles と同じ概念。
--
-- 単純な kind → JSON 配列 (順序保持) の key-value 形式で持つ。
-- 個別 row + position 管理は重複/抜け落ち対策が手間なので、配列の
-- フルリプレースに割り切る。要素数は数十が上限なので問題なし。

CREATE TABLE IF NOT EXISTS master_lists (
  kind        TEXT PRIMARY KEY CHECK (kind IN ('department', 'title')),
  values_json TEXT NOT NULL DEFAULT '[]',
  updated_at  TEXT NOT NULL
);

-- Phase 1 と同じデフォルト値 (流山JC 想定)。
-- 既存値がある場合は上書きしない (INSERT OR IGNORE)。
INSERT OR IGNORE INTO master_lists (kind, values_json, updated_at) VALUES
  (
    'department',
    '["正副・幹事","拡大ヒーローズ","経営革新","キャリーボンド","未来創造","Challenge♾️","組織マネジメント"]',
    '2026-01-01T00:00:00.000Z'
  ),
  (
    'title',
    '["理事長","専務理事","直前理事長","副理事長","顧問","監事","外部監事","委員長","副委員長","メンバー"]',
    '2026-01-01T00:00:00.000Z'
  );

-- Phase 1 で users.status = 'active' | 'inactive' | 'left' を保持していた相当。
-- アクティブ / 休会 / 退会 で一覧の絞り込みを行う。
--
-- SQLite の ALTER TABLE ADD COLUMN は CHECK 制約を含められないバージョンが
-- あるので、ここでは型 + デフォルトのみ。値の妥当性は API 側 (zod) で担保。

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

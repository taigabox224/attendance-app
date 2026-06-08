-- ユーザー表示順 (招待時の並び順) を持つカラム。
-- NULL = 未指定 (= 末尾扱い)。整数値の昇順で並べる。
-- Phase 1 の state.userOrderIds 相当。

ALTER TABLE users ADD COLUMN display_order INTEGER;

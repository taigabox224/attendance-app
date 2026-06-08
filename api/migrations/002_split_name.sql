-- 「名前」を「苗字」+「名前」に分割するためのカラムを追加。
--
-- 設計:
--   - users.name は引き続き表示用フルネーム(family_name + given_name で構成)。
--     既存行(システム管理者のような職名)では family_name = given_name = NULL のまま、
--     name のみ参照する想定。
--   - 新規登録 / 管理者経由作成では family_name + given_name を必須入力にし、
--     アプリ側で name = family_name || given_name(空白なし)で組み立てて格納する。
--
-- SQLite の ALTER TABLE ADD COLUMN は IF NOT EXISTS 句が無く非冪等なので、
-- db.ts 側の schema_migrations 追跡で二度適用を防ぐ。

ALTER TABLE users ADD COLUMN family_name TEXT;
ALTER TABLE users ADD COLUMN given_name TEXT;

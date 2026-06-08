-- 「システム管理者」用の運用アカウントを通常のユーザーフローから隠すための
-- フラグ。is_system_account=1 のユーザーは:
--   - イベント参加者ピッカーに出てこない
--   - 管理者画面の /admin/users 一覧に出てこない
--   - PATCH / DELETE を API レベルで拒否
-- 通常の sysadmin (個人アカウント = family_name/given_name あり) は影響を受けない。

ALTER TABLE users ADD COLUMN is_system_account INTEGER NOT NULL DEFAULT 0;

-- 既存データの後付け: 個人名 (family/given) を持たない sysadmin を
-- system account として扱う。
UPDATE users
   SET is_system_account = 1
 WHERE role = 'sysadmin'
   AND family_name IS NULL
   AND given_name IS NULL;

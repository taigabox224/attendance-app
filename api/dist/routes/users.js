import { db } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';
// 参加者ピッカー用の軽量ユーザー一覧。
// /api/admin/users (sysadmin only) と違って email や role は返さない。
// 退会 (status='left') は除外、休会 (inactive) は含める。
// 並び順は display_order の昇順 → 同値は created_at の昇順。NULL は末尾。
export async function registerUserRoutes(app) {
    app.get('/api/users', { preHandler: requireRole('editor') }, async () => {
        const rows = db
            .prepare(`SELECT id, name, family_name, given_name, department, title
         FROM users
         WHERE status != 'left'
           AND is_system_account = 0
         ORDER BY display_order IS NULL,
                  display_order,
                  COALESCE(family_name, ''),
                  COALESCE(given_name, ''),
                  name`)
            .all();
        return { users: rows };
    });
}
//# sourceMappingURL=users.js.map
import { z } from 'zod';
import { db } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
function readMaster(kind) {
    const row = db
        .prepare(`SELECT values_json FROM master_lists WHERE kind = ?`)
        .get(kind);
    if (!row)
        return [];
    try {
        const arr = JSON.parse(row.values_json);
        if (Array.isArray(arr))
            return arr.filter((s) => typeof s === 'string');
    }
    catch {
        /* fall through */
    }
    return [];
}
const putBodySchema = z.object({
    values: z.array(z.string().min(1).max(60)).max(200),
});
export async function registerMasterRoutes(app) {
    // 読み取りは認証ユーザー全員に開放 (EventForm の select で使う)
    app.get('/api/masters', { preHandler: requireAuth }, async () => {
        return {
            departments: readMaster('department'),
            titles: readMaster('title'),
        };
    });
    // 書き込みは sysadmin のみ
    app.put('/api/masters/:kind', { preHandler: requireRole('editor') }, async (req, reply) => {
        const kind = req.params.kind;
        if (kind !== 'department' && kind !== 'title') {
            return reply.code(400).send({ error: 'kind は department / title のみ' });
        }
        const parsed = putBodySchema.safeParse(req.body);
        if (!parsed.success) {
            return reply.code(400).send({ error: '入力が不正です' });
        }
        // 空白除去 + 空文字除外 + 重複除外 (順序は保持)
        const deduped = [];
        const seen = new Set();
        for (const raw of parsed.data.values) {
            const v = raw.trim();
            if (!v)
                continue;
            if (seen.has(v))
                continue;
            seen.add(v);
            deduped.push(v);
        }
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO master_lists (kind, values_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(kind) DO UPDATE SET values_json = excluded.values_json,
                                          updated_at = excluded.updated_at`).run(kind, JSON.stringify(deduped), now);
        return { values: deduped };
    });
}
//# sourceMappingURL=masters.js.map
import type { FastifyInstance } from 'fastify';
import { db } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';

// 参加者ピッカー用の軽量ユーザー一覧。
// /api/admin/users (sysadmin only) と違って email や role は返さない。
export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/users', { preHandler: requireRole('editor') }, async () => {
    const rows = db
      .prepare(
        `SELECT id, name, family_name, given_name, department, title
         FROM users
         ORDER BY COALESCE(family_name, ''), COALESCE(given_name, ''), name`,
      )
      .all() as Array<{
      id: string;
      name: string;
      family_name: string | null;
      given_name: string | null;
      department: string | null;
      title: string | null;
    }>;
    return { users: rows };
  });
}

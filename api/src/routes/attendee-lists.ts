import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { generateListId } from '../auth/tokens.js';
import { requireRole } from '../middleware/requireRole.js';

interface ListRow {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface ListRowWithCount extends ListRow {
  member_count: number;
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  user_ids: z.array(z.string()).default([]),
});

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  user_ids: z.array(z.string()).optional(),
});

export async function registerAttendeeListRoutes(
  app: FastifyInstance,
): Promise<void> {
  // 一覧の読み取りは viewer も可 (イベント作成フォームでプリセットを使うため)。
  // 作成/更新/削除は editor 以上のまま。
  app.get(
    '/api/attendee-lists',
    { preHandler: requireRole('viewer') },
    async () => {
      const rows = db
        .prepare(
          `SELECT al.id, al.name, al.created_by, al.created_at, al.updated_at,
                  COUNT(alm.user_id) AS member_count
           FROM attendee_lists al
           LEFT JOIN attendee_list_members alm ON alm.list_id = al.id
           GROUP BY al.id
           ORDER BY al.updated_at DESC`,
        )
        .all() as ListRowWithCount[];
      return { lists: rows };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/attendee-lists/:id',
    { preHandler: requireRole('viewer') },
    async (req, reply) => {
      const list = db
        .prepare(`SELECT * FROM attendee_lists WHERE id = ?`)
        .get(req.params.id) as ListRow | undefined;
      if (!list) return reply.code(404).send({ error: 'List not found' });
      const members = db
        .prepare(
          `SELECT user_id FROM attendee_list_members WHERE list_id = ?`,
        )
        .all(req.params.id) as Array<{ user_id: string }>;
      return {
        list: {
          id: list.id,
          name: list.name,
          created_by: list.created_by,
          created_at: list.created_at,
          updated_at: list.updated_at,
          user_ids: members.map((m) => m.user_id),
        },
      };
    },
  );

  app.post(
    '/api/attendee-lists',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: '入力が不正です' });
      const id = generateListId();
      const now = new Date().toISOString();
      const userIds = Array.from(new Set(parsed.data.user_ids));

      const apply = db.transaction(() => {
        db.prepare(
          `INSERT INTO attendee_lists (id, name, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(id, parsed.data.name, req.user!.sub, now, now);
        const insertMember = db.prepare(
          `INSERT OR IGNORE INTO attendee_list_members (list_id, user_id, created_at)
           VALUES (?, ?, ?)`,
        );
        for (const uid of userIds) {
          insertMember.run(id, uid, now);
        }
      });
      apply();

      return reply.code(201).send({ id, member_count: userIds.length });
    },
  );

  app.put<{ Params: { id: string } }>(
    '/api/attendee-lists/:id',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: '入力が不正です' });
      const existing = db
        .prepare(`SELECT id FROM attendee_lists WHERE id = ?`)
        .get(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'List not found' });

      const now = new Date().toISOString();
      const apply = db.transaction(() => {
        if (parsed.data.name !== undefined) {
          db.prepare(
            `UPDATE attendee_lists SET name = ?, updated_at = ? WHERE id = ?`,
          ).run(parsed.data.name, now, req.params.id);
        } else {
          db.prepare(
            `UPDATE attendee_lists SET updated_at = ? WHERE id = ?`,
          ).run(now, req.params.id);
        }
        if (parsed.data.user_ids !== undefined) {
          db.prepare(
            `DELETE FROM attendee_list_members WHERE list_id = ?`,
          ).run(req.params.id);
          const insertMember = db.prepare(
            `INSERT OR IGNORE INTO attendee_list_members (list_id, user_id, created_at)
             VALUES (?, ?, ?)`,
          );
          for (const uid of new Set(parsed.data.user_ids)) {
            insertMember.run(req.params.id, uid, now);
          }
        }
      });
      apply();

      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/attendee-lists/:id',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const result = db
        .prepare(`DELETE FROM attendee_lists WHERE id = ?`)
        .run(req.params.id);
      if (result.changes === 0) {
        return reply.code(404).send({ error: 'List not found' });
      }
      return { ok: true };
    },
  );
}

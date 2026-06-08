import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { hasMinimumRole, type Role } from '../auth/permissions.js';
import { generateEventId } from '../auth/tokens.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const nullableIsoDateTime = z
  .string()
  .datetime({ offset: true })
  .nullable()
  .optional();
const nullableString = z.string().nullable().optional();

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  start_at: z.string().datetime({ offset: true }),
  end_at: nullableIsoDateTime,
  response_deadline: nullableIsoDateTime,
  committee: nullableString,
  location: nullableString,
  description: nullableString,
  published: z.boolean().default(false),
  has_afterparty: z.boolean().default(false),
  afterparty_title: nullableString,
  afterparty_location: nullableString,
  afterparty_description: nullableString,
});

const updateEventSchema = createEventSchema.partial();

interface EventRow {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  response_deadline: string | null;
  committee: string | null;
  location: string | null;
  description: string | null;
  created_by: string;
  published: number;
  has_afterparty: number;
  afterparty_title: string | null;
  afterparty_location: string | null;
  afterparty_description: string | null;
  created_at: string;
  updated_at: string;
}

function rowToEvent(r: EventRow) {
  return {
    id: r.id,
    title: r.title,
    start_at: r.start_at,
    end_at: r.end_at,
    response_deadline: r.response_deadline,
    committee: r.committee,
    location: r.location,
    description: r.description,
    created_by: r.created_by,
    published: r.published === 1,
    has_afterparty: r.has_afterparty === 1,
    afterparty_title: r.afterparty_title,
    afterparty_location: r.afterparty_location,
    afterparty_description: r.afterparty_description,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function registerEventRoutes(app: FastifyInstance): Promise<void> {
  // 一覧。viewer は公開済みのみ、editor 以上は全件 (下書き含む)
  app.get('/api/events', { preHandler: requireAuth }, async (req) => {
    const userRole = req.user!.role as Role;
    const includeAll = hasMinimumRole(userRole, 'editor');
    const rows = includeAll
      ? (db
          .prepare(`SELECT * FROM events ORDER BY start_at DESC`)
          .all() as EventRow[])
      : (db
          .prepare(
            `SELECT * FROM events WHERE published = 1 ORDER BY start_at DESC`,
          )
          .all() as EventRow[]);
    return { events: rows.map(rowToEvent) };
  });

  // 詳細。viewer も公開済みなら閲覧可
  app.get<{ Params: { id: string } }>(
    '/api/events/:id',
    { preHandler: requireAuth },
    async (req, reply) => {
      const row = db
        .prepare(`SELECT * FROM events WHERE id = ?`)
        .get(req.params.id) as EventRow | undefined;
      if (!row) return reply.code(404).send({ error: 'Event not found' });

      const userRole = req.user!.role as Role;
      if (row.published === 0 && !hasMinimumRole(userRole, 'editor')) {
        return reply.code(404).send({ error: 'Event not found' });
      }
      return { event: rowToEvent(row) };
    },
  );

  // 作成 (editor 以上)
  app.post(
    '/api/events',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const parsed = createEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: '入力が不正です', issues: parsed.error.issues });
      }
      const d = parsed.data;
      const id = generateEventId();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO events (
           id, title, start_at, end_at, response_deadline,
           committee, location, description, created_by,
           published, has_afterparty,
           afterparty_title, afterparty_location, afterparty_description,
           created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        d.title,
        d.start_at,
        d.end_at ?? null,
        d.response_deadline ?? null,
        d.committee ?? null,
        d.location ?? null,
        d.description ?? null,
        req.user!.sub,
        d.published ? 1 : 0,
        d.has_afterparty ? 1 : 0,
        d.afterparty_title ?? null,
        d.afterparty_location ?? null,
        d.afterparty_description ?? null,
        now,
        now,
      );

      const row = db
        .prepare(`SELECT * FROM events WHERE id = ?`)
        .get(id) as EventRow;
      return reply.code(201).send({ event: rowToEvent(row) });
    },
  );

  // 更新 (editor 以上、部分更新)
  app.patch<{ Params: { id: string } }>(
    '/api/events/:id',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const parsed = updateEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: '入力が不正です', issues: parsed.error.issues });
      }
      const existing = db
        .prepare(`SELECT id FROM events WHERE id = ?`)
        .get(req.params.id) as { id: string } | undefined;
      if (!existing) return reply.code(404).send({ error: 'Event not found' });

      const sets: string[] = [];
      const params: unknown[] = [];
      const d = parsed.data;
      const push = (col: string, val: unknown) => {
        sets.push(`${col} = ?`);
        params.push(val);
      };

      if (d.title !== undefined) push('title', d.title);
      if (d.start_at !== undefined) push('start_at', d.start_at);
      if (d.end_at !== undefined) push('end_at', d.end_at);
      if (d.response_deadline !== undefined)
        push('response_deadline', d.response_deadline);
      if (d.committee !== undefined) push('committee', d.committee);
      if (d.location !== undefined) push('location', d.location);
      if (d.description !== undefined) push('description', d.description);
      if (d.published !== undefined) push('published', d.published ? 1 : 0);
      if (d.has_afterparty !== undefined)
        push('has_afterparty', d.has_afterparty ? 1 : 0);
      if (d.afterparty_title !== undefined)
        push('afterparty_title', d.afterparty_title);
      if (d.afterparty_location !== undefined)
        push('afterparty_location', d.afterparty_location);
      if (d.afterparty_description !== undefined)
        push('afterparty_description', d.afterparty_description);

      if (sets.length === 0) {
        return reply.code(400).send({ error: '変更項目がありません' });
      }

      sets.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(req.params.id);

      db.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`).run(
        ...params,
      );

      const row = db
        .prepare(`SELECT * FROM events WHERE id = ?`)
        .get(req.params.id) as EventRow;
      return { event: rowToEvent(row) };
    },
  );

  // 削除 (editor 以上)
  app.delete<{ Params: { id: string } }>(
    '/api/events/:id',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const result = db
        .prepare(`DELETE FROM events WHERE id = ?`)
        .run(req.params.id);
      if (result.changes === 0) {
        return reply.code(404).send({ error: 'Event not found' });
      }
      return { ok: true };
    },
  );
}

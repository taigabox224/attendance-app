import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { signCheckinToken, verifyCheckinToken } from '../auth/jwt.js';
import { hasMinimumRole, type Role } from '../auth/permissions.js';
import { generateAttendeeId, generateEventId } from '../auth/tokens.js';
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

  // 詳細。viewer も公開済みなら閲覧可。
  // 参加者一覧 (attendees) と自分自身の rsvp (your_rsvp) を同梱で返す。
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

      const attendees = db
        .prepare(
          `SELECT a.id, a.user_id, a.is_observer, a.observer_name,
                  a.status, a.after_status, a.checked_in_at, a.fee_paid,
                  a.created_at,
                  u.name AS user_name,
                  u.department AS user_department,
                  u.title AS user_title
           FROM event_attendees a
           LEFT JOIN users u ON u.id = a.user_id
           WHERE a.event_id = ?
           ORDER BY a.created_at ASC`,
        )
        .all(req.params.id) as Array<{
        id: string;
        user_id: string | null;
        is_observer: number;
        observer_name: string | null;
        status: string;
        after_status: string | null;
        checked_in_at: string | null;
        fee_paid: number;
        created_at: string;
        user_name: string | null;
        user_department: string | null;
        user_title: string | null;
      }>;

      const attendeesJson = attendees.map((a) => {
        const isObs = a.is_observer === 1;
        return {
          id: a.id,
          user_id: a.user_id,
          is_observer: isObs,
          name: isObs ? (a.observer_name ?? '(ゲスト)') : (a.user_name ?? '(削除済)'),
          department: isObs ? null : a.user_department,
          title: isObs ? null : a.user_title,
          status: a.status,
          after_status: a.after_status,
          checked_in_at: a.checked_in_at,
          fee_paid: a.fee_paid === 1,
        };
      });

      const userId = req.user!.sub;
      const myRow = attendees.find((a) => a.user_id === userId);
      const your_rsvp = myRow
        ? {
            attendee_id: myRow.id,
            status: myRow.status,
            after_status: myRow.after_status,
            checked_in_at: myRow.checked_in_at,
          }
        : null;

      const receptionists = db
        .prepare(
          `SELECT er.user_id, u.name FROM event_receptionists er
           LEFT JOIN users u ON u.id = er.user_id
           WHERE er.event_id = ?
           ORDER BY er.created_at`,
        )
        .all(req.params.id) as Array<{ user_id: string; name: string | null }>;

      return {
        event: rowToEvent(row),
        attendees: attendeesJson,
        your_rsvp,
        receptionists: receptionists.map((r) => ({
          user_id: r.user_id,
          name: r.name ?? '(削除済)',
        })),
      };
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

  // 参加者を追加 (editor 以上)。既存ユーザー一括 + ゲスト (オブザーバー)。
  // 同一 user_id が既に attendee なら INSERT OR IGNORE でスキップする。
  const addAttendeesSchema = z.object({
    user_ids: z.array(z.string()).default([]),
    observers: z.array(z.object({ name: z.string().min(1).max(80) })).default([]),
  });

  app.post<{ Params: { id: string } }>(
    '/api/events/:id/attendees',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const parsed = addAttendeesSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: '入力が不正です' });
      const { user_ids, observers } = parsed.data;
      if (user_ids.length === 0 && observers.length === 0) {
        return reply.code(400).send({ error: '追加する参加者を選んでください' });
      }

      const eventRow = db
        .prepare(`SELECT id FROM events WHERE id = ?`)
        .get(req.params.id) as { id: string } | undefined;
      if (!eventRow) return reply.code(404).send({ error: 'Event not found' });

      const now = new Date().toISOString();
      const addUser = db.prepare(
        `INSERT OR IGNORE INTO event_attendees
           (id, event_id, user_id, is_observer, status, created_at, updated_at)
         VALUES (?, ?, ?, 0, 'pending', ?, ?)`,
      );
      const addObserver = db.prepare(
        `INSERT INTO event_attendees
           (id, event_id, user_id, is_observer, observer_name, status, created_at, updated_at)
         VALUES (?, ?, NULL, 1, ?, 'pending', ?, ?)`,
      );

      let added = 0;
      const txn = db.transaction(() => {
        for (const uid of user_ids) {
          const r = addUser.run(generateAttendeeId(), req.params.id, uid, now, now);
          if (r.changes === 1) added++;
        }
        for (const obs of observers) {
          const r = addObserver.run(generateAttendeeId(), req.params.id, obs.name, now, now);
          if (r.changes === 1) added++;
        }
      });
      txn();

      return reply.code(201).send({ added });
    },
  );

  // 参加者を削除 (editor 以上)
  app.delete<{ Params: { id: string; attendee_id: string } }>(
    '/api/events/:id/attendees/:attendee_id',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const result = db
        .prepare(`DELETE FROM event_attendees WHERE id = ? AND event_id = ?`)
        .run(req.params.attendee_id, req.params.id);
      if (result.changes === 0) {
        return reply.code(404).send({ error: 'Attendee not found' });
      }
      return { ok: true };
    },
  );

  // 参加者のステータスを編集 (editor 以上)。手動で出/欠/受付を切り替える用途。
  // checked_in_at は null を渡せば受付取消、ISO 文字列で受付済みにセット。
  // 'now' を渡すとサーバー側で現在時刻に解決。
  const patchAttendeeSchema = z.object({
    status: z.enum(['pending', 'yes', 'no']).optional(),
    after_status: z.enum(['pending', 'yes', 'no']).nullable().optional(),
    checked_in_at: z
      .union([z.string(), z.null(), z.literal('now')])
      .optional(),
    fee_paid: z.boolean().optional(),
  });

  app.patch<{ Params: { id: string; attendee_id: string } }>(
    '/api/events/:id/attendees/:attendee_id',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const parsed = patchAttendeeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: '入力が不正です' });
      }
      const existing = db
        .prepare(`SELECT id FROM event_attendees WHERE id = ? AND event_id = ?`)
        .get(req.params.attendee_id, req.params.id) as
        | { id: string }
        | undefined;
      if (!existing) return reply.code(404).send({ error: 'Attendee not found' });

      const sets: string[] = [];
      const params: unknown[] = [];
      const d = parsed.data;
      if (d.status !== undefined) {
        sets.push('status = ?');
        params.push(d.status);
      }
      if (d.after_status !== undefined) {
        sets.push('after_status = ?');
        params.push(d.after_status);
      }
      if (d.checked_in_at !== undefined) {
        const v =
          d.checked_in_at === 'now' ? new Date().toISOString() : d.checked_in_at;
        sets.push('checked_in_at = ?');
        params.push(v);
      }
      if (d.fee_paid !== undefined) {
        sets.push('fee_paid = ?');
        params.push(d.fee_paid ? 1 : 0);
      }
      if (sets.length === 0) {
        return reply.code(400).send({ error: '変更項目がありません' });
      }
      const now = new Date().toISOString();
      sets.push('updated_at = ?');
      params.push(now);
      params.push(existing.id);

      db.prepare(
        `UPDATE event_attendees SET ${sets.join(', ')} WHERE id = ?`,
      ).run(...params);

      return { ok: true };
    },
  );

  // 自分の出欠回答 (要認証)。invite されていない人は 404。
  const rsvpSchema = z.object({
    status: z.enum(['pending', 'yes', 'no']),
    after_status: z.enum(['pending', 'yes', 'no']).nullable().optional(),
  });

  app.patch<{ Params: { id: string } }>(
    '/api/events/:id/rsvp',
    { preHandler: requireAuth },
    async (req, reply) => {
      const parsed = rsvpSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: '入力が不正です' });
      const { status, after_status } = parsed.data;

      const myRow = db
        .prepare(
          `SELECT id FROM event_attendees WHERE event_id = ? AND user_id = ?`,
        )
        .get(req.params.id, req.user!.sub) as { id: string } | undefined;
      if (!myRow) {
        return reply
          .code(404)
          .send({ error: 'このイベントの参加者ではありません' });
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE event_attendees
         SET status = ?, after_status = ?, updated_at = ?
         WHERE id = ?`,
      ).run(status, after_status ?? null, now, myRow.id);

      return { ok: true };
    },
  );

  // 受付用 QR トークン発行 (要認証 + 自分が attendee であること)。
  // 中身は JWT。/checkin で検証する。
  app.get<{ Params: { id: string } }>(
    '/api/events/:id/qr-token',
    { preHandler: requireAuth },
    async (req, reply) => {
      const myRow = db
        .prepare(
          `SELECT id FROM event_attendees WHERE event_id = ? AND user_id = ?`,
        )
        .get(req.params.id, req.user!.sub) as { id: string } | undefined;
      if (!myRow) {
        return reply
          .code(404)
          .send({ error: 'このイベントの参加者ではありません' });
      }
      const token = signCheckinToken({
        event_id: req.params.id,
        attendee_id: myRow.id,
      });
      return { token };
    },
  );

  // 受付担当をまとめて差し替え (editor+)。
  // 既存全削除 → 新しい user_id を全部 INSERT。
  const setReceptionistsSchema = z.object({
    user_ids: z.array(z.string()).default([]),
  });

  app.put<{ Params: { id: string } }>(
    '/api/events/:id/receptionists',
    { preHandler: requireRole('editor') },
    async (req, reply) => {
      const parsed = setReceptionistsSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: '入力が不正です' });
      }
      const eventRow = db
        .prepare(`SELECT id FROM events WHERE id = ?`)
        .get(req.params.id) as { id: string } | undefined;
      if (!eventRow) return reply.code(404).send({ error: 'Event not found' });

      // 重複除外
      const unique = Array.from(new Set(parsed.data.user_ids));
      const now = new Date().toISOString();

      const apply = db.transaction(() => {
        db.prepare(`DELETE FROM event_receptionists WHERE event_id = ?`).run(
          req.params.id,
        );
        const insert = db.prepare(
          `INSERT OR IGNORE INTO event_receptionists (event_id, user_id, created_at)
           VALUES (?, ?, ?)`,
        );
        for (const uid of unique) {
          insert.run(req.params.id, uid, now);
        }
      });
      apply();

      return { ok: true, count: unique.length };
    },
  );

  // 受付スキャン: QR から読み取った JWT を検証 → checked_in_at をセット。
  // 重複は 409 (情報付き)、トークン無効は 400。
  // 権限: sysadmin もしくは event_receptionists に指定された user のみ。
  // editor でも receptionists 未指定なら受付不可 (運用ミス防止)。
  const checkinSchema = z.object({ token: z.string().min(1) });

  app.post<{ Params: { id: string } }>(
    '/api/events/:id/checkin',
    { preHandler: requireAuth },
    async (req, reply) => {
      // 受付担当チェック
      const userRole = req.user!.role as Role;
      if (userRole !== 'sysadmin') {
        const row = db
          .prepare(
            `SELECT 1 FROM event_receptionists WHERE event_id = ? AND user_id = ?`,
          )
          .get(req.params.id, req.user!.sub);
        if (!row) {
          return reply
            .code(403)
            .send({ error: '受付担当に指定されていないため受付できません' });
        }
      }

      const parsed = checkinSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'token が必要です' });
      }

      let payload;
      try {
        payload = verifyCheckinToken(parsed.data.token);
      } catch {
        return reply
          .code(400)
          .send({ error: 'QR コードが無効か期限切れです' });
      }

      if (payload.event_id !== req.params.id) {
        return reply
          .code(400)
          .send({ error: 'このイベントの QR コードではありません' });
      }

      const row = db
        .prepare(
          `SELECT a.id, a.checked_in_at, a.is_observer, a.observer_name,
                  a.user_id, u.name AS user_name
           FROM event_attendees a
           LEFT JOIN users u ON u.id = a.user_id
           WHERE a.id = ? AND a.event_id = ?`,
        )
        .get(payload.attendee_id, payload.event_id) as
        | {
            id: string;
            checked_in_at: string | null;
            is_observer: number;
            observer_name: string | null;
            user_id: string | null;
            user_name: string | null;
          }
        | undefined;

      if (!row) {
        return reply.code(404).send({ error: '参加者が見つかりません' });
      }

      const displayName =
        row.is_observer === 1
          ? (row.observer_name ?? '(ゲスト)')
          : (row.user_name ?? '(削除済)');

      if (row.checked_in_at) {
        return reply.code(409).send({
          error: '既に受付済みです',
          attendee: {
            id: row.id,
            name: displayName,
            checked_in_at: row.checked_in_at,
          },
        });
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE event_attendees
         SET checked_in_at = ?, updated_at = ?
         WHERE id = ?`,
      ).run(now, now, row.id);

      return {
        ok: true,
        attendee: {
          id: row.id,
          name: displayName,
          checked_in_at: now,
        },
      };
    },
  );
}

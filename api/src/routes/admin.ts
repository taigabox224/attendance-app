import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { ROLES } from '../auth/permissions.js';
import { generateTempPassword, generateUserId } from '../auth/tokens.js';
import { requireRole } from '../middleware/requireRole.js';
import { sendMail } from '../mail/ses.js';
import { tempPasswordEmail } from '../mail/templates.js';

const nullableString = z.string().nullable().optional();

const USER_STATUSES = ['active', 'inactive', 'left'] as const;

const createUserSchema = z.object({
  email: z.string().email(),
  family_name: z.string().min(1).max(40),
  given_name: z.string().min(1).max(40),
  role: z.enum(ROLES),
  department: nullableString,
  title: nullableString,
  status: z.enum(USER_STATUSES).optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  family_name: z.string().min(1).max(40).optional(),
  given_name: z.string().min(1).max(40).optional(),
  role: z.enum(ROLES).optional(),
  department: nullableString,
  title: nullableString,
  status: z.enum(USER_STATUSES).optional(),
});

interface UserListRow {
  id: string;
  email: string;
  name: string;
  family_name: string | null;
  given_name: string | null;
  role: string;
  department: string | null;
  title: string | null;
  status: string;
  email_verified_at: string | null;
  must_change_password: number;
  created_at: string;
  updated_at: string;
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/admin/users',
    { preHandler: requireRole('sysadmin') },
    async (req, reply) => {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: '入力が不正です' });
      const { email, family_name, given_name, role, department, title } = parsed.data;
      const name = `${family_name}${given_name}`;
      const normalized = email.toLowerCase();
      const now = new Date().toISOString();

      const existing = db
        .prepare(`SELECT id FROM users WHERE email_normalized = ?`)
        .get(normalized) as { id: string } | undefined;
      if (existing) {
        return reply
          .code(409)
          .send({ error: 'このメールアドレスは既に登録されています' });
      }

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      const id = generateUserId();

      db.prepare(
        `INSERT INTO users (
           id, email, email_normalized, name, family_name, given_name,
           password_hash, role, department, title, email_verified_at,
           must_change_password, created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        id,
        email,
        normalized,
        name,
        family_name,
        given_name,
        passwordHash,
        role,
        department ?? null,
        title ?? null,
        now, // email_verified_at: 管理者経由なので認証済み扱い
        now,
        now,
      );

      const mail = tempPasswordEmail({ name, email }, tempPassword);
      await sendMail({ to: email, subject: mail.subject, text: mail.text });

      return reply.code(201).send({
        user: {
          id,
          email,
          name,
          family_name,
          given_name,
          role,
          department: department ?? null,
          title: title ?? null,
        },
      });
    },
  );

  app.get(
    '/api/admin/users',
    { preHandler: requireRole('sysadmin') },
    async () => {
      const rows = db
        .prepare(
          `SELECT id, email, name, family_name, given_name, role, department, title,
                  status, email_verified_at, must_change_password, created_at, updated_at
           FROM users ORDER BY created_at DESC`,
        )
        .all() as UserListRow[];
      return {
        users: rows.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          family_name: u.family_name,
          given_name: u.given_name,
          role: u.role,
          department: u.department,
          title: u.title,
          status: u.status,
          email_verified_at: u.email_verified_at,
          must_change_password: u.must_change_password === 1,
          created_at: u.created_at,
          updated_at: u.updated_at,
        })),
      };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: requireRole('sysadmin') },
    async (req, reply) => {
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: '入力が不正です' });

      const existing = db
        .prepare(`SELECT id FROM users WHERE id = ?`)
        .get(req.params.id) as { id: string } | undefined;
      if (!existing) return reply.code(404).send({ error: 'User not found' });

      const sets: string[] = [];
      const params: unknown[] = [];
      const data = parsed.data;

      // family_name / given_name のいずれかが来たら、現在値とマージしてから
      // name (フルネーム) も再構築する
      if (data.family_name !== undefined || data.given_name !== undefined) {
        const currentNames = db
          .prepare(
            `SELECT family_name, given_name FROM users WHERE id = ?`,
          )
          .get(req.params.id) as
          | { family_name: string | null; given_name: string | null }
          | undefined;
        const family = data.family_name ?? currentNames?.family_name ?? '';
        const given = data.given_name ?? currentNames?.given_name ?? '';
        if (data.family_name !== undefined) {
          sets.push('family_name = ?');
          params.push(family);
        }
        if (data.given_name !== undefined) {
          sets.push('given_name = ?');
          params.push(given);
        }
        const newFullName = `${family}${given}`.trim();
        if (newFullName) {
          sets.push('name = ?');
          params.push(newFullName);
        }
      }

      if (data.email !== undefined) {
        const normalized = data.email.toLowerCase();
        const dup = db
          .prepare(
            `SELECT id FROM users WHERE email_normalized = ? AND id != ?`,
          )
          .get(normalized, req.params.id) as { id: string } | undefined;
        if (dup) {
          return reply
            .code(409)
            .send({ error: 'このメールアドレスは既に使われています' });
        }
        sets.push('email = ?');
        params.push(data.email);
        sets.push('email_normalized = ?');
        params.push(normalized);
      }

      if (data.role !== undefined) {
        sets.push('role = ?');
        params.push(data.role);
      }
      if (data.department !== undefined) {
        sets.push('department = ?');
        params.push(data.department);
      }
      if (data.title !== undefined) {
        sets.push('title = ?');
        params.push(data.title);
      }
      if (data.status !== undefined) {
        sets.push('status = ?');
        params.push(data.status);
      }
      if (sets.length === 0) {
        return reply.code(400).send({ error: '変更項目がありません' });
      }

      const now = new Date().toISOString();
      sets.push('updated_at = ?');
      params.push(now);
      params.push(req.params.id);

      db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/users/:id',
    { preHandler: requireRole('sysadmin') },
    async (req, reply) => {
      // sysadmin が自分を消すと詰むので拒否
      if (req.user!.sub === req.params.id) {
        return reply.code(400).send({ error: '自分自身は削除できません' });
      }
      const result = db
        .prepare(`DELETE FROM users WHERE id = ?`)
        .run(req.params.id);
      if (result.changes === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }
      return { ok: true };
    },
  );
}

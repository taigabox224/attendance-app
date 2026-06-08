import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { COOKIE_NAME, COOKIE_OPTIONS, signToken } from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { isRole } from '../auth/permissions.js';
import { generateToken, generateUserId } from '../auth/tokens.js';
import { isLoginRateLimited, recordLoginAttempt } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendMail } from '../mail/ses.js';
import { verificationEmail } from '../mail/templates.js';

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyQuerySchema = z.object({
  token: z.string().min(1),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
});

interface UserRow {
  id: string;
  email: string;
  email_normalized: string;
  name: string;
  password_hash: string | null;
  role: string;
  department: string | null;
  title: string | null;
  email_verified_at: string | null;
  must_change_password: number;
  created_at: string;
  updated_at: string;
}

function verifyEmailRedirect(status: 'ok' | 'error'): string {
  const base = process.env.APP_URL ?? '';
  return `${base}/verify-email?status=${status}`;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: '入力が不正です' });
    const { email, name, password } = parsed.data;
    const normalized = email.toLowerCase();
    const now = new Date().toISOString();

    const existing = db
      .prepare(`SELECT id FROM users WHERE email_normalized = ?`)
      .get(normalized) as { id: string } | undefined;

    // 列挙対策: 既存メールアドレスでも同じ応答を返す
    if (existing) return reply.code(200).send({ ok: true });

    const id = generateUserId();
    const passwordHash = await hashPassword(password);

    db.prepare(
      `INSERT INTO users (
         id, email, email_normalized, name, password_hash, role,
         must_change_password, created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, 'viewer', 0, ?, ?)`,
    ).run(id, email, normalized, name, passwordHash, now, now);

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO email_verifications (token, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(token, id, expiresAt, now);

    const mail = verificationEmail({ name, email }, token);
    await sendMail({ to: email, subject: mail.subject, text: mail.text });

    return reply.code(200).send({ ok: true });
  });

  app.get('/api/auth/verify-email', async (req, reply) => {
    const parsed = verifyQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.redirect(verifyEmailRedirect('error'));

    const { token } = parsed.data;
    const now = new Date().toISOString();

    const verification = db
      .prepare(
        `SELECT user_id, expires_at, used_at
         FROM email_verifications WHERE token = ?`,
      )
      .get(token) as
      | { user_id: string; expires_at: string; used_at: string | null }
      | undefined;

    if (!verification || verification.used_at || verification.expires_at < now) {
      return reply.redirect(verifyEmailRedirect('error'));
    }

    const txn = db.transaction(() => {
      db.prepare(
        `UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?`,
      ).run(now, now, verification.user_id);
      db.prepare(
        `UPDATE email_verifications SET used_at = ? WHERE token = ?`,
      ).run(now, token);
    });
    txn();

    return reply.redirect(verifyEmailRedirect('ok'));
  });

  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: '入力不足' });
    const { email, password } = parsed.data;
    const normalized = email.toLowerCase();

    if (isLoginRateLimited(normalized)) {
      return reply
        .code(429)
        .send({ error: '試行回数超過。15分後に再試行してください' });
    }

    const user = db
      .prepare(`SELECT * FROM users WHERE email_normalized = ?`)
      .get(normalized) as UserRow | undefined;

    let valid = false;
    if (user?.password_hash) {
      valid = await verifyPassword(password, user.password_hash);
    }

    recordLoginAttempt({
      email: normalized,
      ip: req.ip ?? null,
      success: valid,
    });

    if (!valid || !user) {
      return reply
        .code(401)
        .send({ error: 'メールアドレスまたはパスワードが違います' });
    }
    if (!user.email_verified_at) {
      return reply.code(403).send({ error: 'メール認証が未完了です' });
    }
    if (!isRole(user.role)) {
      return reply.code(500).send({ error: 'Invalid user role' });
    }

    const mustChange = user.must_change_password === 1;
    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      must_change_password: mustChange,
    });
    reply.setCookie(COOKIE_NAME, token, COOKIE_OPTIONS);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        must_change_password: mustChange,
      },
    };
  });

  app.post(
    '/api/auth/logout',
    { preHandler: requireAuth },
    async (_req, reply) => {
      reply.clearCookie(COOKIE_NAME, { path: '/' });
      return { ok: true };
    },
  );

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = db
      .prepare(
        `SELECT id, email, name, role, department, title,
                email_verified_at, must_change_password
         FROM users WHERE id = ?`,
      )
      .get(req.user!.sub) as
      | {
          id: string;
          email: string;
          name: string;
          role: string;
          department: string | null;
          title: string | null;
          email_verified_at: string | null;
          must_change_password: number;
        }
      | undefined;
    if (!user) return reply.code(404).send({ error: 'User not found' });
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        title: user.title,
        email_verified_at: user.email_verified_at,
        must_change_password: user.must_change_password === 1,
      },
    };
  });

  app.post(
    '/api/auth/change-password',
    { preHandler: requireAuth },
    async (req, reply) => {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: '入力不足' });
      const { current_password, new_password } = parsed.data;

      const user = db
        .prepare(
          `SELECT id, password_hash, email, role
           FROM users WHERE id = ?`,
        )
        .get(req.user!.sub) as
        | { id: string; password_hash: string | null; email: string; role: string }
        | undefined;
      if (!user || !user.password_hash) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const valid = await verifyPassword(current_password, user.password_hash);
      if (!valid) {
        return reply.code(401).send({ error: '現在のパスワードが違います' });
      }
      if (!isRole(user.role)) {
        return reply.code(500).send({ error: 'Invalid user role' });
      }

      const newHash = await hashPassword(new_password);
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE users
         SET password_hash = ?, must_change_password = 0, updated_at = ?
         WHERE id = ?`,
      ).run(newHash, now, user.id);

      const token = signToken({
        sub: user.id,
        email: user.email,
        role: user.role,
        must_change_password: false,
      });
      reply.setCookie(COOKIE_NAME, token, COOKIE_OPTIONS);

      return { ok: true };
    },
  );
}

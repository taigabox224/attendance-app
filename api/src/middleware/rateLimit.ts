import { db } from '../db.js';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export function isLoginRateLimited(emailNormalized: string): boolean {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM login_attempts
       WHERE email = ? AND success = 0 AND attempted_at > ?`,
    )
    .get(emailNormalized, since) as { cnt: number };
  return row.cnt >= MAX_FAILURES;
}

export interface LoginAttemptRecord {
  email: string;
  ip: string | null;
  success: boolean;
}

export function recordLoginAttempt(attempt: LoginAttemptRecord): void {
  db.prepare(
    `INSERT INTO login_attempts (email, ip, success, attempted_at)
     VALUES (?, ?, ?, ?)`,
  ).run(
    attempt.email,
    attempt.ip,
    attempt.success ? 1 : 0,
    new Date().toISOString(),
  );
}

import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from './permissions.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  must_change_password: boolean;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return secret;
}

export function signToken(payload: JwtPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
  return jwt.sign(payload, getSecret(), { expiresIn } as SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}

export const COOKIE_NAME = 'auth_token';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60, // 秒単位 (RFC 6265 の Max-Age)
  path: '/',
};

// ───── 受付用 QR トークン ─────
// イベント当日に参加者が受付で見せる QR の中身は、ここで発行する JWT。
// 認証用 JWT と区別するために kind='checkin' を必ず入れ、verify 側で
// 突き合わせる。受付エンドポイント(Chunk 3)が用途。

export interface CheckinTokenPayload {
  kind: 'checkin';
  event_id: string;
  attendee_id: string;
}

export function signCheckinToken(
  payload: Omit<CheckinTokenPayload, 'kind'>,
  expiresIn: string = '24h',
): string {
  return jwt.sign(
    { ...payload, kind: 'checkin' } as CheckinTokenPayload,
    getSecret(),
    { expiresIn } as SignOptions,
  );
}

export function verifyCheckinToken(token: string): CheckinTokenPayload {
  const decoded = jwt.verify(token, getSecret()) as Partial<CheckinTokenPayload>;
  if (decoded.kind !== 'checkin' || !decoded.event_id || !decoded.attendee_id) {
    throw new Error('Invalid checkin token payload');
  }
  return decoded as CheckinTokenPayload;
}

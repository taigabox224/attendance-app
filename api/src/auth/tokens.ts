import crypto from 'node:crypto';

// 紛らわしい文字 (O, 0, I, l, 1) を除外したアルファベット
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTempPassword(length = 12): string {
  const bytes = crypto.randomBytes(length);
  const out: string[] = [];
  for (const byte of bytes) {
    out.push(ALPHABET.charAt(byte % ALPHABET.length));
  }
  return out.join('');
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 文字 hex
}

export function generateUserId(): string {
  return `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

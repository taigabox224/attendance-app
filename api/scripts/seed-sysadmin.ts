// 開発用: 最初の sysadmin ユーザーを直接 SQL で作成する。
// メール認証スキップ + must_change_password=0 で即ログイン可能な状態にする。
//
// 使い方:
//   cp .env.example .env  (まだなら)
//   EMAIL=admin@example.com NAME="Your Name" PASSWORD=your-password \
//     npm run seed:sysadmin
//
// 同じメールが既に存在する場合は作成せず、SQL で昇格する方法を表示する。

import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is not set. Either:\n' +
      '  - cp .env.example .env (recommended), OR\n' +
      '  - run with DATABASE_URL=file:./data/app.db EMAIL=... ...',
  );
  process.exit(1);
}

const email = process.env.EMAIL;
const name = process.env.NAME;
const password = process.env.PASSWORD;

if (!email || !name || !password) {
  console.error(
    'Missing required env vars.\n' +
      'Usage: EMAIL=... NAME=... PASSWORD=... npm run seed:sysadmin',
  );
  process.exit(1);
}

// dotenv が DATABASE_URL を設定した「あと」に db.ts を読み込みたいので動的 import
const { db, runMigrations } = await import('../src/db.js');
const { hashPassword } = await import('../src/auth/password.js');
const { generateUserId } = await import('../src/auth/tokens.js');

runMigrations();

const normalized = email.toLowerCase();
const existing = db
  .prepare('SELECT id, role FROM users WHERE email_normalized = ?')
  .get(normalized) as { id: string; role: string } | undefined;

if (existing) {
  console.error(
    `User already exists: id=${existing.id} email=${email} role=${existing.role}`,
  );
  const dbFile = process.env.DATABASE_URL.replace(/^file:/, '');
  console.error('To promote this user to sysadmin, run:');
  console.error(
    `  sqlite3 ${dbFile} "UPDATE users SET role='sysadmin' WHERE email_normalized='${normalized}'"`,
  );
  process.exit(1);
}

const now = new Date().toISOString();
const hash = await hashPassword(password);
const id = generateUserId();

db.prepare(
  `INSERT INTO users (
     id, email, email_normalized, name, password_hash, role,
     email_verified_at, must_change_password, created_at, updated_at
   ) VALUES (?, ?, ?, ?, ?, 'sysadmin', ?, 0, ?, ?)`,
).run(id, email, normalized, name, hash, now, now, now);

console.log(`Created sysadmin: id=${id} email=${email} name=${name}`);
process.exit(0);

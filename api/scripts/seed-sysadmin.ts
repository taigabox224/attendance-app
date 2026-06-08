// 開発用: 最初の sysadmin ユーザーを直接 SQL で作成する。
// メール認証スキップ + must_change_password=0 で即ログイン可能な状態にする。
//
// 個人アカウント (推奨):
//   EMAIL=foo@example.com FAMILY_NAME=村岡 GIVEN_NAME=映心 PASSWORD=... \
//     npm run seed:sysadmin
//
// 非個人のシステムアカウント (職名のみ等、苗字/名前分離なし):
//   EMAIL=sysadmin@example.com NAME="システム管理者" PASSWORD=... \
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
const password = process.env.PASSWORD;
const familyName = process.env.FAMILY_NAME;
const givenName = process.env.GIVEN_NAME;
const rawName = process.env.NAME;

let name: string;
let dbFamily: string | null;
let dbGiven: string | null;

if (familyName && givenName) {
  name = `${familyName}${givenName}`;
  dbFamily = familyName;
  dbGiven = givenName;
} else if (rawName) {
  name = rawName;
  dbFamily = null;
  dbGiven = null;
} else {
  console.error(
    'Missing name. Provide either:\n' +
      '  - FAMILY_NAME + GIVEN_NAME (recommended for personal accounts)\n' +
      '  - NAME (for non-personal accounts like a shared sysadmin)',
  );
  process.exit(1);
}

if (!email || !password) {
  console.error(
    'Missing required env vars.\n' +
      'Usage: EMAIL=... FAMILY_NAME=... GIVEN_NAME=... PASSWORD=... npm run seed:sysadmin',
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
     id, email, email_normalized, name, family_name, given_name,
     password_hash, role, email_verified_at, must_change_password,
     created_at, updated_at
   ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sysadmin', ?, 0, ?, ?)`,
).run(id, email, normalized, name, dbFamily, dbGiven, hash, now, now, now);

console.log(`Created sysadmin: id=${id} email=${email} name=${name}`);
process.exit(0);

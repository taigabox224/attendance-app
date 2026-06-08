// 開発用: デフォルトの sysadmin アカウントを一気に作る。
// 認証情報は api/.env の SEED_* 変数から読む (gitignore されてる)。
//
//   npm run seed:defaults
//
// 既に同じ email が存在する場合はスキップ (idempotent)。空欄の SEED_* は無視。

import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./data/app.db';
}

const { db, runMigrations } = await import('../src/db.js');
const { hashPassword } = await import('../src/auth/password.js');
const { generateUserId } = await import('../src/auth/tokens.js');

runMigrations();

interface Spec {
  label: string;
  email: string | undefined;
  password: string | undefined;
  // system account の場合 NAME のみ + is_system_account=1。
  // 個人アカウントの場合 FAMILY + GIVEN を渡す。
  name?: string;
  family?: string | undefined;
  given?: string | undefined;
  isSystemAccount: boolean;
}

const specs: Spec[] = [
  // 1) システム運用専用アカウント (is_system_account=1)
  {
    label: 'システム管理者 (運用)',
    email: process.env.SEED_SYSADMIN_EMAIL,
    password: process.env.SEED_SYSADMIN_PASSWORD,
    name: 'システム管理者',
    isSystemAccount: true,
  },
  // 2) 村岡
  {
    label: '村岡',
    email: process.env.SEED_MURAOKA_EMAIL,
    password: process.env.SEED_MURAOKA_PASSWORD,
    family: process.env.SEED_MURAOKA_FAMILY,
    given: process.env.SEED_MURAOKA_GIVEN,
    isSystemAccount: false,
  },
  // 3) 足立
  {
    label: '足立',
    email: process.env.SEED_ADACHI_EMAIL,
    password: process.env.SEED_ADACHI_PASSWORD,
    family: process.env.SEED_ADACHI_FAMILY,
    given: process.env.SEED_ADACHI_GIVEN,
    isSystemAccount: false,
  },
];

const findByEmail = db.prepare(
  `SELECT id, role FROM users WHERE email_normalized = ?`,
);
const insert = db.prepare(
  `INSERT INTO users (
     id, email, email_normalized, name, family_name, given_name,
     password_hash, role, email_verified_at, must_change_password,
     is_system_account, created_at, updated_at
   ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sysadmin', ?, 0, ?, ?, ?)`,
);

let created = 0;
let skipped = 0;
let missing = 0;

for (const spec of specs) {
  if (!spec.email || !spec.password) {
    console.warn(`  [skip] ${spec.label}: SEED_*_EMAIL / _PASSWORD 未設定`);
    missing++;
    continue;
  }
  const normalized = spec.email.toLowerCase();
  const existing = findByEmail.get(normalized) as
    | { id: string; role: string }
    | undefined;
  if (existing) {
    console.log(`  [skip] ${spec.label}: 既に存在 (id=${existing.id})`);
    skipped++;
    continue;
  }

  let name: string;
  let family: string | null;
  let given: string | null;
  if (spec.isSystemAccount) {
    name = spec.name ?? 'システム管理者';
    family = null;
    given = null;
  } else {
    if (!spec.family || !spec.given) {
      console.warn(
        `  [skip] ${spec.label}: FAMILY / GIVEN が未設定 (個人アカウント)`,
      );
      missing++;
      continue;
    }
    family = spec.family;
    given = spec.given;
    name = `${family}${given}`;
  }

  const now = new Date().toISOString();
  const hash = await hashPassword(spec.password);
  const id = generateUserId();
  insert.run(
    id,
    spec.email,
    normalized,
    name,
    family,
    given,
    hash,
    now,
    spec.isSystemAccount ? 1 : 0,
    now,
    now,
  );
  console.log(
    `  [create] ${spec.label} (${spec.email}) role=sysadmin system=${spec.isSystemAccount ? '1' : '0'}`,
  );
  created++;
}

console.log(
  `\n${created} 件作成 / ${skipped} 件スキップ (既存) / ${missing} 件スキップ (.env 未設定)`,
);
process.exit(0);

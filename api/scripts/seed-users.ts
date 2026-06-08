// 開発用: editor / viewer のダミーユーザーを投入する。
//
//   npm run seed:users
//
// パスワードは PASSWORD env で指定 (デフォルト: "password")。
// 既に同じ email が存在するユーザーはスキップする (idempotent)。

import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./data/app.db';
}

const password = process.env.PASSWORD ?? 'password';

const { db, runMigrations } = await import('../src/db.js');
const { hashPassword } = await import('../src/auth/password.js');
const { generateUserId } = await import('../src/auth/tokens.js');

runMigrations();

type Role = 'editor' | 'viewer';

interface SeedUser {
  family_name: string;
  given_name: string;
  email: string;
  role: Role;
  department: string;
  title: string;
}

// 流山JC のマスター (migrations/004) に合わせた委員会・役職を使う。
// editor は委員長クラス、viewer は一般メンバークラスをイメージ。
const users: SeedUser[] = [
  // editor (= 副理事長 / 委員長クラス)
  {
    family_name: '佐藤',
    given_name: '健一',
    email: 'sato.kenichi@example.jp',
    role: 'editor',
    department: '正副・幹事',
    title: '副理事長',
  },
  {
    family_name: '田中',
    given_name: '美咲',
    email: 'tanaka.misaki@example.jp',
    role: 'editor',
    department: '拡大ヒーローズ',
    title: '委員長',
  },
  {
    family_name: '高橋',
    given_name: '翔太',
    email: 'takahashi.shota@example.jp',
    role: 'editor',
    department: '経営革新',
    title: '委員長',
  },

  // viewer (= 一般メンバー)
  {
    family_name: '渡辺',
    given_name: '葵',
    email: 'watanabe.aoi@example.jp',
    role: 'viewer',
    department: '拡大ヒーローズ',
    title: '副委員長',
  },
  {
    family_name: '伊藤',
    given_name: '大樹',
    email: 'ito.daiki@example.jp',
    role: 'viewer',
    department: '経営革新',
    title: 'メンバー',
  },
  {
    family_name: '山本',
    given_name: '亜紀',
    email: 'yamamoto.aki@example.jp',
    role: 'viewer',
    department: 'キャリーボンド',
    title: '委員長',
  },
  {
    family_name: '中村',
    given_name: '拓海',
    email: 'nakamura.takumi@example.jp',
    role: 'viewer',
    department: 'キャリーボンド',
    title: 'メンバー',
  },
  {
    family_name: '小林',
    given_name: '玲奈',
    email: 'kobayashi.rena@example.jp',
    role: 'viewer',
    department: '未来創造',
    title: '副委員長',
  },
  {
    family_name: '加藤',
    given_name: '颯太',
    email: 'kato.sota@example.jp',
    role: 'viewer',
    department: '未来創造',
    title: 'メンバー',
  },
  {
    family_name: '吉田',
    given_name: '彩花',
    email: 'yoshida.ayaka@example.jp',
    role: 'viewer',
    department: 'Challenge♾️',
    title: '委員長',
  },
  {
    family_name: '山田',
    given_name: '陽斗',
    email: 'yamada.haruto@example.jp',
    role: 'viewer',
    department: 'Challenge♾️',
    title: 'メンバー',
  },
  {
    family_name: '佐々木',
    given_name: '千夏',
    email: 'sasaki.chinatsu@example.jp',
    role: 'viewer',
    department: '組織マネジメント',
    title: '副委員長',
  },
  {
    family_name: '松本',
    given_name: '直樹',
    email: 'matsumoto.naoki@example.jp',
    role: 'viewer',
    department: '組織マネジメント',
    title: 'メンバー',
  },
  {
    family_name: '井上',
    given_name: '萌',
    email: 'inoue.moe@example.jp',
    role: 'viewer',
    department: '正副・幹事',
    title: '監事',
  },
  {
    family_name: '木村',
    given_name: '誠',
    email: 'kimura.makoto@example.jp',
    role: 'viewer',
    department: '正副・幹事',
    title: '直前理事長',
  },
];

const now = new Date().toISOString();
const hash = await hashPassword(password);

const findByEmail = db.prepare(
  `SELECT id FROM users WHERE email_normalized = ?`,
);
const insert = db.prepare(
  `INSERT INTO users (
     id, email, email_normalized, name, family_name, given_name,
     password_hash, role, department, title,
     status, email_verified_at, must_change_password,
     is_system_account, created_at, updated_at
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, ?, ?)`,
);

let created = 0;
let skipped = 0;
const txn = db.transaction(() => {
  for (const u of users) {
    const normalized = u.email.toLowerCase();
    if (findByEmail.get(normalized)) {
      skipped++;
      continue;
    }
    const id = generateUserId();
    const name = `${u.family_name}${u.given_name}`;
    insert.run(
      id,
      u.email,
      normalized,
      name,
      u.family_name,
      u.given_name,
      hash,
      u.role,
      u.department,
      u.title,
      now,
      now,
      now,
    );
    created++;
    console.log(`  [${u.role}] ${name} (${u.email})`);
  }
});
txn();

console.log(
  `\n${created} 件作成 / ${skipped} 件スキップ (既存)。パスワードは全員 "${password}"`,
);
process.exit(0);

// 開発用: イベント + 参加者 + 出欠状態のサンプルデータを投入する。
// デフォルトは「既にイベントがあれば終了」。FORCE=true で全削除して入れ直す。
//
//   npm run seed:events            (空 DB のときだけ動く)
//   FORCE=true npm run seed:events (上書き、events と関連 attendees を消す)

import 'dotenv/config';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./data/app.db';
}

const force = process.env.FORCE === 'true';

const { db, runMigrations } = await import('../src/db.js');
const { generateAttendeeId, generateEventId } = await import('../src/auth/tokens.js');

runMigrations();

const existingCount = (
  db.prepare('SELECT COUNT(*) AS c FROM events').get() as { c: number }
).c;

if (existingCount > 0 && !force) {
  console.error(
    `既に ${existingCount} 件のイベントがあります。上書きするには FORCE=true を付けて再実行してください。`,
  );
  process.exit(1);
}

if (force) {
  console.log('既存イベントを削除中 (関連 attendees / receptionists も CASCADE で消えます)...');
  db.prepare('DELETE FROM events').run();
}

// システムアカウント (運用専用 sysadmin) は出欠データに混ぜない。
// 通常の sysadmin (個人アカウント) は普通に参加者として扱う。
const users = db
  .prepare(
    `SELECT id, name, role FROM users
     WHERE is_system_account = 0
     ORDER BY created_at`,
  )
  .all() as Array<{ id: string; name: string; role: string }>;

if (users.length === 0) {
  console.error(
    'users が 0 件です。先に npm run seed:sysadmin / seed:users で参加者を用意してください。',
  );
  process.exit(1);
}

// 作成者は最初の sysadmin (なければ最初のユーザー)
const creator = users.find((u) => u.role === 'sysadmin') ?? users[0]!;

// 「今」を基準に日付計算
const now = new Date();
function daysFromNow(n: number): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return d;
}
function at(date: Date, hours: number, minutes = 0): string {
  const x = new Date(date);
  x.setHours(hours, minutes, 0, 0);
  return x.toISOString();
}

interface SeedEvent {
  title: string;
  startOffsetDays: number;
  startHour: number;
  endHour: number | null;
  committee: string | null;
  location: string | null;
  description: string | null;
  published: boolean;
  has_afterparty: boolean;
  afterparty_title: string | null;
  afterparty_location: string | null;
  afterparty_description: string | null;
  attendeeScope: 'all' | 'sysadmin-only';
  checkedInCount: number; // 先頭 N 人を受付済み扱いにする (受付モード動作確認用)
  observers: string[];
}

const events: SeedEvent[] = [
  // 過去イベント (回答締切超過の表示テスト用)
  {
    title: '2026年5月度例会',
    startOffsetDays: -20,
    startHour: 19,
    endHour: 21,
    committee: '正副・幹事',
    location: 'スターツおおたかの森ホール',
    description: '5月の定例会。スーツ着用。',
    published: true,
    has_afterparty: true,
    afterparty_title: '懇親会',
    afterparty_location: '居酒屋 旬彩',
    afterparty_description: '会費 4,000 円',
    attendeeScope: 'all',
    checkedInCount: 8, // 過去イベントなのでほぼ全員受付済
    observers: ['(ゲスト) 山田太郎'],
  },
  // 近日開催 (受付モード動作確認用)
  {
    title: '2026年6月度例会',
    startOffsetDays: 2,
    startHour: 19,
    endHour: 21,
    committee: '拡大ヒーローズ',
    location: 'スターツおおたかの森ホール',
    description:
      'スーツ着用。受付は 18:30 から。\n初参加の方は受付で氏名をお伝えください。',
    published: true,
    has_afterparty: true,
    afterparty_title: '懇親会',
    afterparty_location: '居酒屋 旬彩(本社から徒歩3分)',
    afterparty_description: '会費 4,000 円(当日集金)',
    attendeeScope: 'all',
    checkedInCount: 2, // 一部だけ受付済 → 受付モードで残りをスキャン
    observers: ['(ゲスト) 鈴木花子(株式会社X)'],
  },
  // 来月の研修
  {
    title: '2026年7月度例会',
    startOffsetDays: 30,
    startHour: 19,
    endHour: 21,
    committee: '経営革新',
    location: '流山市役所 大会議室',
    description: 'ゲスト講師による経営研修。詳細は決定次第共有します。',
    published: true,
    has_afterparty: true,
    afterparty_title: '懇親会',
    afterparty_location: '未定',
    afterparty_description: null,
    attendeeScope: 'all',
    checkedInCount: 0,
    observers: [],
  },
  // 理事会 (sysadmin-only)
  {
    title: '6月度理事会',
    startOffsetDays: 7,
    startHour: 19,
    endHour: 20,
    committee: '正副・幹事',
    location: '本社会議室',
    description: '議題は別途共有。',
    published: true,
    has_afterparty: false,
    afterparty_title: null,
    afterparty_location: null,
    afterparty_description: null,
    attendeeScope: 'sysadmin-only',
    checkedInCount: 0,
    observers: [],
  },
  // 委員会イベント
  {
    title: 'キャリーボンド事業 視察会',
    startOffsetDays: 14,
    startHour: 13,
    endHour: 17,
    committee: 'キャリーボンド',
    location: '集合: 流山おおたかの森駅前',
    description: '視察先は当日案内します。',
    published: true,
    has_afterparty: false,
    afterparty_title: null,
    afterparty_location: null,
    afterparty_description: null,
    attendeeScope: 'all',
    checkedInCount: 0,
    observers: [],
  },
  // 下書き
  {
    title: '新入会員ガイダンス',
    startOffsetDays: 21,
    startHour: 18,
    endHour: 20,
    committee: '拡大ヒーローズ',
    location: '本社会議室',
    description: '新入会員向けオリエンテーション。内容調整中。',
    published: false,
    has_afterparty: false,
    afterparty_title: null,
    afterparty_location: null,
    afterparty_description: null,
    attendeeScope: 'all',
    checkedInCount: 0,
    observers: [],
  },
];

const insertEvent = db.prepare(
  `INSERT INTO events (
     id, title, start_at, end_at, response_deadline,
     committee, location, description, created_by,
     published, has_afterparty,
     afterparty_title, afterparty_location, afterparty_description,
     created_at, updated_at
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const insertUserAttendee = db.prepare(
  `INSERT INTO event_attendees (
     id, event_id, user_id, is_observer,
     status, after_status, checked_in_at,
     created_at, updated_at
   ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
);

const insertObserver = db.prepare(
  `INSERT INTO event_attendees (
     id, event_id, user_id, is_observer, observer_name,
     status, created_at, updated_at
   ) VALUES (?, ?, NULL, 1, ?, 'pending', ?, ?)`,
);

// 状態をローテーションで割り当てる(yes / no / pending を順番に)
const statusRotation = ['yes', 'no', 'pending', 'yes'] as const;

const nowIso = new Date().toISOString();
const seed = db.transaction(() => {
  for (const e of events) {
    const startD = daysFromNow(e.startOffsetDays);
    const start = at(startD, e.startHour);
    const end = e.endHour !== null ? at(startD, e.endHour) : null;
    // 回答期限は開始の 2 日前 18:00
    const deadline = at(daysFromNow(e.startOffsetDays - 2), 18);
    const id = generateEventId();

    insertEvent.run(
      id,
      e.title,
      start,
      end,
      deadline,
      e.committee,
      e.location,
      e.description,
      creator.id,
      e.published ? 1 : 0,
      e.has_afterparty ? 1 : 0,
      e.afterparty_title,
      e.afterparty_location,
      e.afterparty_description,
      nowIso,
      nowIso,
    );

    const targets =
      e.attendeeScope === 'sysadmin-only'
        ? users.filter((u) => u.role === 'sysadmin')
        : users;

    targets.forEach((u, i) => {
      const status = statusRotation[i % statusRotation.length]!;
      const checkedIn = i < e.checkedInCount ? nowIso : null;
      const afterStatus = e.has_afterparty
        ? statusRotation[(i + 1) % statusRotation.length]!
        : null;
      insertUserAttendee.run(
        generateAttendeeId(),
        id,
        u.id,
        status,
        afterStatus,
        checkedIn,
        nowIso,
        nowIso,
      );
    });

    for (const name of e.observers) {
      insertObserver.run(generateAttendeeId(), id, name, nowIso, nowIso);
    }

    console.log(
      `[${e.published ? '公開' : '下書'}] ${e.title} (${id}) - ${targets.length}名 + ${e.observers.length}ゲスト${e.checkedInCount > 0 ? ` / 受付済${e.checkedInCount}名` : ''}`,
    );
  }
});

seed();
console.log(`\n${events.length} 件のイベントを投入しました。`);
process.exit(0);

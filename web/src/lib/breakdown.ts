// イベントの出席内訳を計算するユーティリティ。
// 出欠率の母数は「委員会のアクティブメンバー数」 (legacy computeAttendanceBreakdown 仕様)。
// 招待されているかどうかは関係ない: 委員会に所属していて active なら母数に入る。

type RsvpStatus = 'pending' | 'yes' | 'no';

interface AttendeeLike {
  is_observer: boolean;
  department: string | null;
  status: RsvpStatus;
  checked_in_at: string | null;
  after_status?: RsvpStatus | null;
  fee_paid?: boolean;
}

interface UserLike {
  id: string;
  department: string | null;
}

export interface AttendeeStats {
  // 招待された人数 (event_attendees に入っている人数)。
  // 一覧表示用に保持しているだけで、出欠率の計算には使わない。
  invited: number;
  // この委員会の active メンバー数 (= 出欠率の母数)。
  members: number;
  yes: number;
  no: number;
  pending: number;
  checkedIn: number;
  afterYes: number;
  afterPaid: number;
}

export interface AttendanceBreakdown {
  byCommittee: Array<{ key: string; stats: AttendeeStats }>;
  total: AttendeeStats;
  observers: AttendeeStats;
}

function emptyStats(): AttendeeStats {
  return {
    invited: 0,
    members: 0,
    yes: 0,
    no: 0,
    pending: 0,
    checkedIn: 0,
    afterYes: 0,
    afterPaid: 0,
  };
}

function accumulateAttendee(stats: AttendeeStats, a: AttendeeLike): void {
  stats.invited++;
  if (a.status === 'yes') stats.yes++;
  else if (a.status === 'no') stats.no++;
  else stats.pending++;
  if (a.checked_in_at) stats.checkedIn++;
  if (a.after_status === 'yes') stats.afterYes++;
  if (a.fee_paid) stats.afterPaid++;
}

const UNASSIGNED_KEY = '(未所属)';

export function computeBreakdown(
  attendees: AttendeeLike[],
  committeeOrder: string[] = [],
  // 委員会別母数を出すための active ユーザー一覧。
  // 渡さない (legacy 互換用フォールバック) と members は 0 のまま = '-' 表示。
  activeUsers: UserLike[] = [],
): AttendanceBreakdown {
  const groups = new Map<string, AttendeeStats>();
  const observers = emptyStats();

  // ① まず active ユーザーから委員会別母数を作る (招待されているかに関係ない)
  for (const u of activeUsers) {
    if (!u.department) continue;
    const g = groups.get(u.department) ?? emptyStats();
    g.members++;
    groups.set(u.department, g);
  }

  // ② attendees の数値 (yes/no/checkedIn/...) を委員会別に積み上げる
  for (const a of attendees) {
    if (a.is_observer) {
      accumulateAttendee(observers, a);
      continue;
    }
    const key = a.department ?? UNASSIGNED_KEY;
    const g = groups.get(key) ?? emptyStats();
    accumulateAttendee(g, a);
    groups.set(key, g);
  }

  // 順序: 委員会マスター順 → マスター外 → (未所属)
  const ordered: Array<{ key: string; stats: AttendeeStats }> = [];
  for (const c of committeeOrder) {
    if (groups.has(c)) {
      ordered.push({ key: c, stats: groups.get(c)! });
      groups.delete(c);
    }
  }
  // 残った委員会 (マスター外 or 未所属) を末尾に。未所属はさらに最後に。
  const remaining: Array<{ key: string; stats: AttendeeStats }> = [];
  for (const [key, stats] of groups) {
    remaining.push({ key, stats });
  }
  remaining.sort((a, b) => {
    if (a.key === UNASSIGNED_KEY) return 1;
    if (b.key === UNASSIGNED_KEY) return -1;
    return a.key.localeCompare(b.key);
  });
  ordered.push(...remaining);

  // 全体は active ユーザー全員 (委員会未設定も含む) を母数にする
  const total = emptyStats();
  total.members = activeUsers.length;
  for (const g of ordered) {
    total.invited += g.stats.invited;
    total.yes += g.stats.yes;
    total.no += g.stats.no;
    total.pending += g.stats.pending;
    total.checkedIn += g.stats.checkedIn;
    total.afterYes += g.stats.afterYes;
    total.afterPaid += g.stats.afterPaid;
  }

  return { byCommittee: ordered, total, observers };
}

// 出欠率 = 受付済 / その委員会の active メンバー数
export function attendanceRate(stats: AttendeeStats): string {
  if (stats.members === 0) return '—';
  return ((stats.checkedIn / stats.members) * 100).toFixed(1) + '%';
}

// 旧 checkInRate は attendanceRate と同義になった (互換のため alias 保持)。
export const checkInRate = attendanceRate;

// 懇親会会費受領率: 受領 / 出席予定。母数は active メンバーではなく
// 「懇親会に来ると答えた人数」 = afterYes。
export function feeRate(stats: AttendeeStats): string {
  if (stats.afterYes === 0) return '—';
  return ((stats.afterPaid / stats.afterYes) * 100).toFixed(1) + '%';
}

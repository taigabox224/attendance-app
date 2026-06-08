// イベントの出席内訳を計算するユーティリティ。
// Phase 1 の computeAttendanceBreakdown 相当。

type RsvpStatus = 'pending' | 'yes' | 'no';

interface AttendeeLike {
  is_observer: boolean;
  department: string | null;
  status: RsvpStatus;
  checked_in_at: string | null;
}

export interface AttendeeStats {
  invited: number;
  yes: number;
  no: number;
  pending: number;
  checkedIn: number;
}

export interface AttendanceBreakdown {
  byCommittee: Array<{ key: string; stats: AttendeeStats }>;
  total: AttendeeStats;
  observers: AttendeeStats;
}

function emptyStats(): AttendeeStats {
  return { invited: 0, yes: 0, no: 0, pending: 0, checkedIn: 0 };
}

function accumulate(stats: AttendeeStats, a: AttendeeLike): void {
  stats.invited++;
  if (a.status === 'yes') stats.yes++;
  else if (a.status === 'no') stats.no++;
  else stats.pending++;
  if (a.checked_in_at) stats.checkedIn++;
}

const UNASSIGNED_KEY = '(未所属)';

export function computeBreakdown(
  attendees: AttendeeLike[],
  committeeOrder: string[] = [],
): AttendanceBreakdown {
  const groups = new Map<string, AttendeeStats>();
  const observers = emptyStats();

  for (const a of attendees) {
    if (a.is_observer) {
      accumulate(observers, a);
      continue;
    }
    const key = a.department ?? UNASSIGNED_KEY;
    const g = groups.get(key) ?? emptyStats();
    accumulate(g, a);
    groups.set(key, g);
  }

  // 委員会マスター順 → 未所属
  const ordered: Array<{ key: string; stats: AttendeeStats }> = [];
  for (const c of committeeOrder) {
    if (groups.has(c)) {
      ordered.push({ key: c, stats: groups.get(c)! });
      groups.delete(c);
    }
  }
  // 残った committee (マスター外 / 未所属) を末尾に
  for (const [key, stats] of groups) {
    ordered.push({ key, stats });
  }

  const total = emptyStats();
  for (const g of ordered) {
    total.invited += g.stats.invited;
    total.yes += g.stats.yes;
    total.no += g.stats.no;
    total.pending += g.stats.pending;
    total.checkedIn += g.stats.checkedIn;
  }

  return { byCommittee: ordered, total, observers };
}

export function attendanceRate(stats: AttendeeStats): string {
  if (stats.invited === 0) return '-';
  return ((stats.yes / stats.invited) * 100).toFixed(1) + '%';
}

export function checkInRate(stats: AttendeeStats): string {
  if (stats.invited === 0) return '-';
  return ((stats.checkedIn / stats.invited) * 100).toFixed(1) + '%';
}

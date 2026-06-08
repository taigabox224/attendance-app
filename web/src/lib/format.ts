// 日時/曜日の整形ユーティリティ。複数のページで使うのでここに集約。
// legacy (web/legacy/index.html の fmtDate / fmtDateRange) と表記を揃える。

const DAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;
const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${DAYS[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 開始-終了の範囲表示。同日なら終了は時刻だけ。
export function formatDateRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
): string {
  if (!startIso) return '';
  if (!endIso) return formatDateTime(startIso);
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return formatDateTime(startIso);
  }
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const endHHMM = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  if (sameDay) return `${formatDateTime(startIso)} – ${endHHMM}`;
  return `${formatDateTime(startIso)}\n  – ${formatDateTime(endIso)}`;
}

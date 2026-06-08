// イベント一覧の期間フィルタ用ユーティリティ。
// Phase 1 プロトタイプの挙動と同じ:
//   - 当月: 月初〜月末
//   - 本日以降+翌月: 今日〜翌月末
//   - 期間指定: 今日〜無期限 (to 空)
//   - 日付を手で変えると preset='custom'

export type DateRangePreset =
  | 'this-month'
  | 'today-and-next'
  | 'open-ended'
  | 'custom';

export interface DateRange {
  preset: DateRangePreset;
  from: string; // YYYY-MM-DD (空文字 = 制約なし)
  to: string;
}

export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function defaultDateRange(): DateRange {
  const now = new Date();
  const endNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return {
    preset: 'today-and-next',
    from: toDateInput(now),
    to: toDateInput(endNextMonth),
  };
}

export function applyPreset(preset: DateRangePreset): DateRange {
  const now = new Date();
  if (preset === 'this-month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      preset,
      from: toDateInput(first),
      to: toDateInput(last),
    };
  }
  if (preset === 'today-and-next') {
    return defaultDateRange();
  }
  if (preset === 'open-ended') {
    return { preset, from: toDateInput(now), to: '' };
  }
  return defaultDateRange();
}

export function filterByRange<T extends { start_at: string }>(
  items: T[],
  range: DateRange,
): T[] {
  const from = range.from ? new Date(`${range.from}T00:00:00`) : null;
  const to = range.to ? new Date(`${range.to}T23:59:59`) : null;
  if (!from && !to) return items;
  return items.filter((e) => {
    const d = new Date(e.start_at);
    if (Number.isNaN(d.getTime())) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

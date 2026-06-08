import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';

// datetime-local が macOS Safari 等で時刻入力しづらいので、
// フォームでは date / time を別々に持ち、送信時にローカル日時として
// 結合 → UTC ISO8601 に変換する。

export interface EventFormValues {
  title: string;
  start_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_date: string;
  end_time: string;
  deadline_date: string;
  deadline_time: string;
  committee: string;
  location: string;
  description: string;
  published: boolean;
  has_afterparty: boolean;
  afterparty_title: string;
  afterparty_location: string;
  afterparty_description: string;
}

export interface EventFormPayload {
  title: string;
  start_at: string;
  end_at: string | null;
  response_deadline: string | null;
  committee: string | null;
  location: string | null;
  description: string | null;
  published: boolean;
  has_afterparty: boolean;
  afterparty_title: string | null;
  afterparty_location: string | null;
  afterparty_description: string | null;
}

export const emptyEventForm: EventFormValues = {
  title: '',
  start_date: '',
  start_time: '18:00', // JC の例会は夕方開始が定番なのでデフォ値を入れる
  end_date: '',
  end_time: '',
  deadline_date: '',
  deadline_time: '',
  committee: '',
  location: '',
  description: '',
  published: false,
  has_afterparty: false,
  afterparty_title: '',
  afterparty_location: '',
  afterparty_description: '',
};

// date + time(ローカル) → UTC ISO8601。time 未入力なら 00:00 を補う。
function combineToIso(date: string, time: string): string | null {
  if (!date) return null;
  const t = time || '00:00';
  const d = new Date(`${date}T${t}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ISO8601 → ローカル "YYYY-MM-DD"
export function isoToDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ISO8601 → ローカル "HH:MM"
export function isoToTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nullableTrim(s: string): string | null {
  const t = s.trim();
  return t === '' ? null : t;
}

export function valuesToPayload(v: EventFormValues): EventFormPayload {
  return {
    title: v.title.trim(),
    start_at: combineToIso(v.start_date, v.start_time) ?? '',
    end_at: combineToIso(v.end_date, v.end_time),
    response_deadline: combineToIso(v.deadline_date, v.deadline_time),
    committee: nullableTrim(v.committee),
    location: nullableTrim(v.location),
    description: nullableTrim(v.description),
    published: v.published,
    has_afterparty: v.has_afterparty,
    afterparty_title: v.has_afterparty ? nullableTrim(v.afterparty_title) : null,
    afterparty_location: v.has_afterparty ? nullableTrim(v.afterparty_location) : null,
    afterparty_description: v.has_afterparty ? nullableTrim(v.afterparty_description) : null,
  };
}

interface DateTimeRowProps {
  idPrefix: string;
  labelPrefix: string;
  dateValue: string;
  timeValue: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  required?: boolean;
}

function DateTimeRow({
  idPrefix,
  labelPrefix,
  dateValue,
  timeValue,
  onDateChange,
  onTimeChange,
  required,
}: DateTimeRowProps) {
  return (
    <div className="field-row">
      <div className="field" style={{ flex: 2 }}>
        <label htmlFor={`${idPrefix}-date`}>{labelPrefix}(日付)</label>
        <input
          id={`${idPrefix}-date`}
          type="date"
          value={dateValue}
          onChange={(e) => onDateChange(e.target.value)}
          required={required}
        />
      </div>
      <div className="field" style={{ flex: 1 }}>
        <label htmlFor={`${idPrefix}-time`}>時刻</label>
        <input
          id={`${idPrefix}-time`}
          type="time"
          value={timeValue}
          onChange={(e) => onTimeChange(e.target.value)}
          required={required}
        />
      </div>
    </div>
  );
}

interface Props {
  initialValues: EventFormValues;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: EventFormPayload) => Promise<void>;
  onCancel?: () => void;
}

export function EventForm({
  initialValues,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [v, setV] = useState<EventFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!v.title.trim()) {
      setError('タイトルを入力してください');
      return;
    }
    if (!v.start_date || !v.start_time) {
      setError('開始日と時刻を入力してください');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(valuesToPayload(v));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-stack">
      <div className="field">
        <label htmlFor="ev-title">タイトル</label>
        <input
          id="ev-title"
          type="text"
          value={v.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder="例: 2026年6月度例会"
          maxLength={200}
          required
        />
      </div>

      <DateTimeRow
        idPrefix="ev-start"
        labelPrefix="開始"
        dateValue={v.start_date}
        timeValue={v.start_time}
        onDateChange={(x) => update('start_date', x)}
        onTimeChange={(x) => update('start_time', x)}
        required
      />

      <DateTimeRow
        idPrefix="ev-end"
        labelPrefix="終了"
        dateValue={v.end_date}
        timeValue={v.end_time}
        onDateChange={(x) => update('end_date', x)}
        onTimeChange={(x) => update('end_time', x)}
      />

      <DateTimeRow
        idPrefix="ev-deadline"
        labelPrefix="回答期限"
        dateValue={v.deadline_date}
        timeValue={v.deadline_time}
        onDateChange={(x) => update('deadline_date', x)}
        onTimeChange={(x) => update('deadline_time', x)}
      />

      <div className="field">
        <label htmlFor="ev-committee">担当委員会(任意)</label>
        <input
          id="ev-committee"
          type="text"
          value={v.committee}
          onChange={(e) => update('committee', e.target.value)}
          placeholder="例: 事業"
        />
      </div>

      <div className="field">
        <label htmlFor="ev-location">場所(任意)</label>
        <input
          id="ev-location"
          type="text"
          value={v.location}
          onChange={(e) => update('location', e.target.value)}
          placeholder="例: スターツおおたかの森ホール"
        />
      </div>

      <div className="field">
        <label htmlFor="ev-desc">詳細(任意)</label>
        <textarea
          id="ev-desc"
          rows={4}
          value={v.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="服装、持ち物、注意事項など"
        />
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={v.has_afterparty}
          onChange={(e) => update('has_afterparty', e.target.checked)}
        />
        <span>二次会あり</span>
      </label>

      {v.has_afterparty && (
        <div className="afterparty-section">
          <div className="field">
            <label htmlFor="ev-ap-title">二次会タイトル</label>
            <input
              id="ev-ap-title"
              type="text"
              value={v.afterparty_title}
              onChange={(e) => update('afterparty_title', e.target.value)}
              placeholder="例: 懇親会"
            />
          </div>
          <div className="field">
            <label htmlFor="ev-ap-loc">二次会場所</label>
            <input
              id="ev-ap-loc"
              type="text"
              value={v.afterparty_location}
              onChange={(e) => update('afterparty_location', e.target.value)}
              placeholder="例: 居酒屋 旬彩(本社から徒歩3分)"
            />
          </div>
          <div className="field">
            <label htmlFor="ev-ap-desc">二次会詳細</label>
            <textarea
              id="ev-ap-desc"
              rows={3}
              value={v.afterparty_description}
              onChange={(e) => update('afterparty_description', e.target.value)}
              placeholder="会費、地図URL、注意事項など"
            />
          </div>
        </div>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={v.published}
          onChange={(e) => update('published', e.target.checked)}
        />
        <span>公開する(チェックを外すと下書き)</span>
      </label>

      {error && <p className="error">{error}</p>}

      <div className="action-row">
        <button type="submit" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel} disabled={submitting}>
            キャンセル
          </button>
        )}
      </div>
    </form>
  );
}

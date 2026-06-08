import { useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';

export interface EventFormValues {
  title: string;
  start_at: string; // datetime-local 形式 (YYYY-MM-DDTHH:MM)
  end_at: string;
  response_deadline: string;
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
  start_at: string; // ISO 8601 (UTC)
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
  start_at: '',
  end_at: '',
  response_deadline: '',
  committee: '',
  location: '',
  description: '',
  published: false,
  has_afterparty: false,
  afterparty_title: '',
  afterparty_location: '',
  afterparty_description: '',
};

// "2026-06-08T15:00" (local) → ISO 8601 (UTC)
function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ISO 8601 → "2026-06-08T15:00" (local) for input
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nullableTrim(s: string): string | null {
  const t = s.trim();
  return t === '' ? null : t;
}

export function valuesToPayload(v: EventFormValues): EventFormPayload {
  return {
    title: v.title.trim(),
    start_at: localInputToIso(v.start_at) ?? '',
    end_at: localInputToIso(v.end_at),
    response_deadline: localInputToIso(v.response_deadline),
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

interface Props {
  initialValues: EventFormValues;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: EventFormPayload) => Promise<void>;
  onCancel?: () => void;
}

export function EventForm({ initialValues, submitLabel, submittingLabel, onSubmit, onCancel }: Props) {
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
    if (!v.start_at) {
      setError('開始日時を入力してください');
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
          maxLength={200}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="ev-start">開始日時</label>
        <input
          id="ev-start"
          type="datetime-local"
          value={v.start_at}
          onChange={(e) => update('start_at', e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="ev-end">終了日時(任意)</label>
        <input
          id="ev-end"
          type="datetime-local"
          value={v.end_at}
          onChange={(e) => update('end_at', e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="ev-deadline">回答期限(任意)</label>
        <input
          id="ev-deadline"
          type="datetime-local"
          value={v.response_deadline}
          onChange={(e) => update('response_deadline', e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="ev-committee">担当委員会(任意)</label>
        <input
          id="ev-committee"
          type="text"
          value={v.committee}
          onChange={(e) => update('committee', e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="ev-location">場所(任意)</label>
        <input
          id="ev-location"
          type="text"
          value={v.location}
          onChange={(e) => update('location', e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="ev-desc">詳細(任意)</label>
        <textarea
          id="ev-desc"
          rows={4}
          value={v.description}
          onChange={(e) => update('description', e.target.value)}
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
            />
          </div>
          <div className="field">
            <label htmlFor="ev-ap-loc">二次会場所</label>
            <input
              id="ev-ap-loc"
              type="text"
              value={v.afterparty_location}
              onChange={(e) => update('afterparty_location', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ev-ap-desc">二次会詳細</label>
            <textarea
              id="ev-ap-desc"
              rows={3}
              value={v.afterparty_description}
              onChange={(e) => update('afterparty_description', e.target.value)}
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

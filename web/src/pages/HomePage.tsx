import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AdminTabs } from '../components/AdminTabs';
import { DateInput } from '../components/DateInput';
import { formatDateTime } from '../lib/format';
import {
  applyPreset,
  defaultDateRange,
  filterByRange,
  type DateRange,
  type DateRangePreset,
} from '../lib/dateRange';

interface EventSummary {
  id: string;
  title: string;
  start_at: string;
  committee: string | null;
  location: string | null;
  published: boolean;
  created_by: string;
  response_deadline: string | null;
  has_afterparty: boolean;
  your_status: 'pending' | 'yes' | 'no' | null;
  is_receptionist: boolean;
}

const STATUS_LABEL: Record<'pending' | 'yes' | 'no', string> = {
  pending: '未回答',
  yes: '出席',
  no: '欠席',
};

const PRESET_LABELS: { key: DateRangePreset; label: string }[] = [
  { key: 'this-month', label: '当月' },
  { key: 'today-and-next', label: '本日以降+翌月' },
  { key: 'open-ended', label: '期間指定' },
];

export function HomePage() {
  const { user, viewMode } = useAuth();
  const isPrivileged = user?.role === 'sysadmin' || user?.role === 'editor';
  // 「新規作成」「下書き表示」「編集リンク」は admin モードのみ
  const canEdit = isPrivileged && viewMode === 'admin';
  // editor+ なら user モードでも「新規作成」だけは出す
  const canCreateEvent = isPrivileged;

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => defaultDateRange());

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<{ events: EventSummary[] }>('/api/events');
      setEvents(d.events);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleEvents = useMemo(() => {
    const byVisibility = canEdit ? events : events.filter((e) => e.published);
    const byDate = filterByRange(byVisibility, range);
    return [...byDate].sort((a, b) => a.start_at.localeCompare(b.start_at));
  }, [events, range, canEdit]);

  function selectPreset(p: DateRangePreset) {
    setRange(applyPreset(p));
  }

  function updateInput(which: 'from' | 'to', value: string) {
    setRange((prev) => ({ ...prev, [which]: value, preset: 'custom' }));
  }

  if (!user) return null;

  const displayName = user.family_name?.trim() || user.name?.trim() || '';

  return (
    <div className="screen">
      <AdminTabs />

      <header className="screen-header row">
        <div>
          {canEdit ? (
            <h1 className="screen-title" style={{ fontSize: 24 }}>
              登録されているイベント
            </h1>
          ) : (
            <>
              <h1 className="screen-title">
                {displayName ? `${displayName}さんのイベント` : 'あなたのイベント'}
              </h1>
              <p className="screen-sub">招待または作成したイベントを表示</p>
            </>
          )}
        </div>
        {canCreateEvent && (
          <Link
            to="/events/new"
            className="link-button"
            style={{ flex: 'none', padding: '7px 12px', fontSize: 12, minHeight: 'auto', background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)' }}
          >
            + 新規作成
          </Link>
        )}
      </header>

      <div className="date-range-filter">
        <div className="filter-chips">
          {PRESET_LABELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`chip ${range.preset === key ? 'active' : ''}`}
              onClick={() => selectPreset(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="date-range-inputs">
          <DateInput
            value={range.from}
            onChange={(v) => updateInput('from', v)}
          />
          <span className="sep">〜</span>
          <DateInput
            value={range.to}
            onChange={(v) => updateInput('to', v)}
          />
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>読込中...</p>
      ) : visibleEvents.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">○</div>
          <div className="hint">
            {events.length === 0
              ? '表示できるイベントがありません'
              : '指定期間に該当するイベントはありません'}
          </div>
        </div>
      ) : (
        <ul className="event-list">
          {visibleEvents.map((e) => {
            const isOwn = isPrivileged && e.created_by === user.id;
            const deadlinePassed = !!(
              e.response_deadline && new Date(e.response_deadline) < new Date()
            );
            return (
              <li key={e.id}>
                <Link
                  to={`/events/${e.id}`}
                  className={`event-card ${!e.published ? 'is-draft' : ''}`}
                >
                  <div className="date-row">
                    <span className="date-tag">{formatDateTime(e.start_at)}</span>
                    {isOwn && <span className="event-badge own">自作</span>}
                    {e.is_receptionist && (
                      <span className="event-badge reception">🛡️ 受付</span>
                    )}
                    {e.has_afterparty && (
                      <span className="event-badge afterparty">🍻 懇親会</span>
                    )}
                    {deadlinePassed && (
                      <span className="event-badge expired">回答締切</span>
                    )}
                    {canEdit && !e.published && (
                      <span className="event-badge draft">下書き</span>
                    )}
                  </div>
                  <div className="card-title">{e.title}</div>
                  <div className="card-meta">
                    {e.committee && <span>{e.committee}</span>}
                    {e.location && <span>{e.location}</span>}
                  </div>
                  {e.your_status && (
                    <div className={`status-badge badge-${e.your_status}`}>
                      <span>{STATUS_LABEL[e.your_status]}</span>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { formatDateTime } from '../lib/format';

interface EventSummary {
  id: string;
  title: string;
  start_at: string;
  committee: string | null;
  location: string | null;
  published: boolean;
}

export function EventListPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'sysadmin' || user?.role === 'editor';

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<{ events: EventSummary[] }>('/api/events');
      setEvents(data.events);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="screen">
      <Link to="/" className="back-link">ホームへ</Link>

      <header className="screen-header row">
        <div>
          <h1 className="screen-title">イベント</h1>
          <p className="screen-sub">
            {canEdit ? '作成・編集・公開できます' : '公開済みのイベント一覧'}
          </p>
        </div>
        {canEdit && (
          <Link to="/events/new" className="link-button" style={{ flex: 'none', padding: '8px 14px' }}>
            新規作成
          </Link>
        )}
      </header>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>読込中...</p>
      ) : events.length === 0 ? (
        <p className="note">表示できるイベントがありません。</p>
      ) : (
        <ul className="event-list">
          {events.map((e) => (
            <li key={e.id}>
              <Link to={`/events/${e.id}`} className="event-card">
                <div className="date-row">
                  <span className="date-tag">{formatDateTime(e.start_at)}</span>
                  {canEdit && !e.published && <span className="badge warn">下書き</span>}
                </div>
                <div className="card-title">{e.title}</div>
                <div className="card-meta">
                  {e.committee && <span>{e.committee}</span>}
                  {e.location && <span>{e.location}</span>}
                </div>
              </Link>
              {canEdit && (
                <Link to={`/events/${e.id}/edit`} className="card-edit-link">
                  編集する →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

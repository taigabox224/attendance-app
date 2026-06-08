import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface EventSummary {
  id: string;
  title: string;
  start_at: string;
  committee: string | null;
  location: string | null;
  published: boolean;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    <div className="app-frame">
      <p>
        <Link to="/">← ホームへ</Link>
      </p>
      <h1>イベント</h1>

      {canEdit && (
        <div className="action-stack" style={{ marginTop: 0, marginBottom: 24 }}>
          <Link to="/events/new" className="link-button">
            新規イベントを作成
          </Link>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>読込中...</p>
      ) : events.length === 0 ? (
        <p className="note">表示できるイベントがありません。</p>
      ) : (
        <ul className="event-list">
          {events.map((e) => (
            <li key={e.id} className="event-row">
              <div className="event-row-head">
                <strong>{e.title}</strong>
                {canEdit && !e.published && <span className="badge warn">下書き</span>}
              </div>
              <div className="event-row-meta">
                <span className="mono">{formatDateTime(e.start_at)}</span>
                {e.committee && <span>{e.committee}</span>}
                {e.location && <span>{e.location}</span>}
              </div>
              {canEdit && (
                <div className="event-row-actions">
                  <Link to={`/events/${e.id}/edit`} className="link-button">
                    編集
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

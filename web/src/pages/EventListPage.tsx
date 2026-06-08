import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AdminTabs } from '../components/AdminTabs';
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
  const { user, viewMode } = useAuth();
  const isPrivileged = user?.role === 'sysadmin' || user?.role === 'editor';
  // editor+ がユーザー画面プレビュー中はビューアー扱い
  const canEdit = isPrivileged && viewMode === 'admin';

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const visibleEvents = useMemo(
    () => (canEdit ? events : events.filter((e) => e.published)),
    [events, canEdit],
  );

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
      <AdminTabs />
      <Link to="/" className="back-link">ホームへ</Link>

      <header className="screen-header row">
        <div>
          <h1 className="screen-title">イベント</h1>
          <p className="screen-sub">
            {canEdit ? '作成・編集・公開できます' : '公開済みのイベント一覧'}
          </p>
        </div>
        {canEdit && (
          <Link to="/events/new" className="btn-sm" style={{ flex: 'none', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', padding: '7px 12px', background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 500 }}>
            + 新規作成
          </Link>
        )}
      </header>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>読込中...</p>
      ) : visibleEvents.length === 0 ? (
        <p className="note">表示できるイベントがありません。</p>
      ) : (
        <ul className="event-list">
          {visibleEvents.map((e) => (
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

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import {
  EventForm,
  isoToDate,
  isoToTime,
  type EventFormPayload,
  type EventFormValues,
} from '../components/EventForm';

interface EventDetail {
  id: string;
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

function eventToForm(e: EventDetail): EventFormValues {
  return {
    title: e.title,
    start_date: isoToDate(e.start_at),
    start_time: isoToTime(e.start_at),
    end_date: isoToDate(e.end_at),
    end_time: isoToTime(e.end_at),
    deadline_date: isoToDate(e.response_deadline),
    deadline_time: isoToTime(e.response_deadline),
    committee: e.committee ?? '',
    location: e.location ?? '',
    description: e.description ?? '',
    published: e.published,
    has_afterparty: e.has_afterparty,
    afterparty_title: e.afterparty_title ?? '',
    afterparty_location: e.afterparty_location ?? '',
    afterparty_description: e.afterparty_description ?? '',
  };
}

export function EventEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [initial, setInitial] = useState<EventFormValues | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api<{ event: EventDetail }>(`/api/events/${id}`)
      .then((data) => setInitial(eventToForm(data.event)))
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : '通信エラー'));
  }, [id]);

  async function onSubmit(payload: EventFormPayload) {
    if (!id) return;
    await api(`/api/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    navigate('/events', { replace: true });
  }

  async function onDelete() {
    if (!id) return;
    const ok = window.confirm('このイベントを削除しますか?\nこの操作は取り消せません。');
    if (!ok) return;
    try {
      await api(`/api/events/${id}`, { method: 'DELETE' });
      navigate('/events', { replace: true });
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : '通信エラー');
    }
  }

  return (
    <div className="app-frame">
      <p>
        <Link to="/events">← イベント一覧へ</Link>
      </p>
      <h1>イベント編集</h1>

      {loadError ? (
        <p className="error">{loadError}</p>
      ) : !initial ? (
        <p>読込中...</p>
      ) : (
        <>
          <EventForm
            initialValues={initial}
            submitLabel="更新"
            submittingLabel="更新中..."
            onSubmit={onSubmit}
            onCancel={() => navigate('/events')}
          />
          <hr style={{ margin: '32px 0 16px', border: 'none', borderTop: '1px solid var(--border)' }} />
          <button className="danger" onClick={onDelete} style={{ width: '100%' }}>
            このイベントを削除
          </button>
        </>
      )}
    </div>
  );
}

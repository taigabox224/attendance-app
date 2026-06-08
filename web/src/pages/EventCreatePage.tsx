import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  EventForm,
  emptyEventForm,
  type EventFormPayload,
} from '../components/EventForm';

export function EventCreatePage() {
  const navigate = useNavigate();

  async function onSubmit(payload: EventFormPayload) {
    await api('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    navigate('/events', { replace: true });
  }

  return (
    <div className="screen">
      <Link to="/events" className="back-link">イベント一覧へ</Link>
      <header className="screen-header">
        <h1 className="screen-title">新規イベント</h1>
      </header>
      <EventForm
        initialValues={emptyEventForm}
        submitLabel="作成"
        submittingLabel="作成中..."
        onSubmit={onSubmit}
        onCancel={() => navigate('/events')}
      />
    </div>
  );
}

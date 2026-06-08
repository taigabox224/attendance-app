import { Link, useParams } from 'react-router-dom';
import { EventFormFull } from '../components/EventFormFull';

export function EventEditPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="screen">
      <Link to="/events" className="back-link">イベント一覧へ</Link>
      <header className="screen-header">
        <h1 className="screen-title">イベントを編集</h1>
      </header>
      {id && <EventFormFull mode="edit" eventId={id} />}
    </div>
  );
}

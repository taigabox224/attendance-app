import { Link, useParams } from 'react-router-dom';
import { EventFormFull } from '../components/EventFormFull';

export function EventEditPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="screen">
      <Link to="/events" className="back-link">イベント一覧へ</Link>
      <header className="screen-header row event-form-header">
        <h1 className="screen-title event-form-title">イベントを編集</h1>
        <span className="form-required-note">
          <span className="required-mark">*</span> は必須項目です
        </span>
      </header>
      {id && <EventFormFull mode="edit" eventId={id} />}
    </div>
  );
}

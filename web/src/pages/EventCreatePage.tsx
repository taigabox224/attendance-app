import { Link } from 'react-router-dom';
import { EventFormFull } from '../components/EventFormFull';

export function EventCreatePage() {
  return (
    <div className="screen">
      <Link to="/events" className="back-link">イベント一覧へ</Link>
      <header className="screen-header row event-form-header">
        <h1 className="screen-title event-form-title">イベントを作成</h1>
        <span className="form-required-note">
          <span className="required-mark">*</span> は必須項目です
        </span>
      </header>
      <EventFormFull mode="create" />
    </div>
  );
}

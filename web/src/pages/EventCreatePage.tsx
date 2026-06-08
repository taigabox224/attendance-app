import { Link } from 'react-router-dom';
import { EventFormFull } from '../components/EventFormFull';

export function EventCreatePage() {
  return (
    <div className="screen">
      <Link to="/events" className="back-link">イベント一覧へ</Link>
      <header className="screen-header">
        <h1 className="screen-title">イベントを作成</h1>
      </header>
      <EventFormFull mode="create" />
    </div>
  );
}

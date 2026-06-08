import { useState } from 'react';
import { AttendeeListsModal } from './AttendeeListsModal';
import { MastersModal } from './MastersModal';
import { UserOrderModal } from './UserOrderModal';

interface Props {
  onClose: () => void;
}

type ActiveModal = 'masters' | 'order' | 'lists' | null;

// ユーザー管理画面の歯車から開く設定メニュー。
// 各項目は別画面に遷移するのではなく、その場でモーダルを重ねて開く
// (legacy user-list-menu と同じ挙動)。
export function AdminSettingsMenu({ onClose }: Props) {
  const [active, setActive] = useState<ActiveModal>(null);

  // どれかのサブモーダルが開いている間は親メニューは隠す
  if (active === 'masters') {
    return <MastersModal onClose={onClose} />;
  }
  if (active === 'order') {
    return <UserOrderModal onClose={onClose} />;
  }
  if (active === 'lists') {
    return <AttendeeListsModal onClose={onClose} />;
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" aria-hidden="true" />
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="閉じる"
        >
          ×
        </button>
        <h2>ユーザー管理 設定</h2>
        <div className="action-stack" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="link-button"
            onClick={() => setActive('masters')}
          >
            委員会・役職マスター
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => setActive('order')}
          >
            ユーザー表示順
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => setActive('lists')}
          >
            参加者リスト(プリセット)
          </button>
        </div>
      </div>
    </div>
  );
}

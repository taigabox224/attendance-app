import { Link } from 'react-router-dom';

interface Props {
  onClose: () => void;
}

export function AdminSettingsMenu({ onClose }: Props) {
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
          <Link to="/admin/masters" onClick={onClose} className="link-button">
            委員会・役職マスター
          </Link>
          <Link to="/admin/users/order" onClick={onClose} className="link-button">
            ユーザー表示順
          </Link>
          <Link
            to="/admin/attendee-lists"
            onClick={onClose}
            className="link-button"
          >
            参加者リスト(プリセット)
          </Link>
        </div>
      </div>
    </div>
  );
}

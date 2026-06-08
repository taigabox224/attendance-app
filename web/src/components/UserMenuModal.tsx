import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ProfileEditModal } from './ProfileEditModal';

interface Props {
  onClose: () => void;
}

export function UserMenuModal({ onClose }: Props) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [showProfile, setShowProfile] = useState(false);

  async function onLogout() {
    onClose();
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
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
          <h2>マイメニュー</h2>
          <div className="action-stack" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="link-button"
              onClick={() => setShowProfile(true)}
            >
              プロフィール編集
            </button>
            <Link
              to="/change-password"
              onClick={onClose}
              className="link-button"
            >
              パスワード変更
            </Link>
            <button className="secondary" onClick={onLogout}>
              ログアウト
            </button>
          </div>
        </div>
      </div>
      {showProfile && (
        <ProfileEditModal
          onClose={() => {
            setShowProfile(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

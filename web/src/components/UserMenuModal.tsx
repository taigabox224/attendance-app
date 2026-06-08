import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ProfileEditModal } from './ProfileEditModal';

interface Props {
  onClose: () => void;
}

export function UserMenuModal({ onClose }: Props) {
  const { user, viewMode, setViewMode, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfile, setShowProfile] = useState(false);

  const isPrivileged =
    !!user && (user.role === 'sysadmin' || user.role === 'editor');

  function toggleMode() {
    const next = viewMode === 'admin' ? 'user' : 'admin';
    setViewMode(next);
    // モード切替時は必ず /events に戻す。途中の画面でモード切替が起きると
    // 表示中のデータと権限が噛み合わずバグの温床になるため。
    if (location.pathname !== '/events') {
      navigate('/events');
    }
    onClose();
  }

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
            {isPrivileged && (
              <button
                type="button"
                className="link-button"
                onClick={toggleMode}
              >
                {viewMode === 'admin'
                  ? 'ユーザーモードに切替'
                  : '管理者モードに切替'}
              </button>
            )}
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

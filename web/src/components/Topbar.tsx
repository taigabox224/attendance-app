import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, type Role } from '../auth/AuthContext';
import { UserMenuModal } from './UserMenuModal';

const ROLE_LABEL: Record<Role, string> = {
  sysadmin: 'システム管理者',
  editor: '編集者',
  viewer: '閲覧者',
};

function avatarInitial(name: string): string {
  if (!name) return '?';
  return Array.from(name)[0] ?? '?';
}

export function Topbar() {
  const { user } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      <header className="topbar">
        <Link to="/events" className="brand">
          <span className="brand-logo" aria-hidden="true" />
          <span className="brand-text">
            <span className="brand-text-line1">流山青年会議所</span>
            <span className="brand-text-line2">イベント管理アプリ</span>
          </span>
        </Link>

        {user && (
          <div className="topbar-right">
            <div className="role-pill" aria-label={`${ROLE_LABEL[user.role]} としてログイン中`}>
              <span className="avatar">{avatarInitial(user.name)}</span>
              <span className="label">
                <span className="name">{user.name}</span>
                <span className="role">{ROLE_LABEL[user.role]}</span>
              </span>
            </div>
            <button
              type="button"
              className="user-menu-btn"
              onClick={() => setShowMenu(true)}
              aria-label="マイメニュー"
              title="マイメニュー"
            >
              ⚙
            </button>
          </div>
        )}
      </header>

      {showMenu && <UserMenuModal onClose={() => setShowMenu(false)} />}
    </>
  );
}

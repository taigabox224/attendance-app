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
  const { user, viewMode } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  // editor+ で viewMode='admin' のとき、Topbar の見た目を変えて
  // 「今は管理者モードです」を分かりやすくする
  const isAdminMode =
    !!user &&
    (user.role === 'sysadmin' || user.role === 'editor') &&
    viewMode === 'admin';

  return (
    <>
      <header className={`topbar ${isAdminMode ? 'is-admin' : ''}`}>
        <Link to="/events" className="brand">
          <span className="brand-logo" aria-hidden="true" />
          <span className="brand-text">
            <span className="brand-text-line1">流山青年会議所</span>
            <span className="brand-text-line2">イベント管理アプリ</span>
          </span>
        </Link>

        {user && (
          <div className="topbar-right">
            {isAdminMode && (
              <span
                className="topbar-mode-badge"
                title="管理者モードで表示中"
              >
                管理者
              </span>
            )}
            <div
              className="role-pill"
              aria-label={`${ROLE_LABEL[user.role]} としてログイン中`}
            >
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

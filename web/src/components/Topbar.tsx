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
        <Link to="/events" className="brand" aria-label="流山青年会議所 イベント管理アプリ">
          {/* 仮ロゴ。正式なものをもらったら public/jc-logo.jpg を差し替え */}
          <img
            src="/jc-logo.jpg"
            alt="流山青年会議所"
            className="brand-banner"
          />
          <span className="brand-app-name">イベント管理アプリ</span>
        </Link>

        {user && (
          <div className="topbar-right">
            <div
              className={`role-pill ${isAdminMode ? 'is-admin' : ''}`}
              aria-label={
                isAdminMode
                  ? `${user.name} (管理者モード)`
                  : `${ROLE_LABEL[user.role]} としてログイン中`
              }
            >
              <span className="avatar">{avatarInitial(user.name)}</span>
              <span className="label">
                <span className="name">{user.name}</span>
                <span className="role">
                  {isAdminMode ? '管理者モード' : ROLE_LABEL[user.role]}
                </span>
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

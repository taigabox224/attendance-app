import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// sysadmin が /events と /admin/users を行き来する 2 タブナビ。
// 他のロール (editor / viewer) には何も表示しない。
// ユーザー画面プレビュー中 (viewMode='user') も非表示。
export function AdminTabs() {
  const { user, viewMode } = useAuth();
  if (user?.role !== 'sysadmin') return null;
  if (viewMode === 'user') return null;
  return (
    <div className="admin-tabs">
      <NavLink
        to="/"
        end
        className={({ isActive }) => 'admin-tab' + (isActive ? ' active' : '')}
      >
        イベント
      </NavLink>
      <NavLink
        to="/admin/users"
        className={({ isActive }) => 'admin-tab' + (isActive ? ' active' : '')}
      >
        ユーザー
      </NavLink>
    </div>
  );
}

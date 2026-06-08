import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// editor 以上 + 管理者モードのときだけ表示する 2 タブナビ (legacy parity)。
// /admin/users は editor にも開放されている (ユーザー管理は管理者と同じ操作可能)。
export function AdminTabs() {
  const { user, viewMode } = useAuth();
  if (!user) return null;
  if (user.role !== 'sysadmin' && user.role !== 'editor') return null;
  if (viewMode === 'user') return null;
  return (
    <div className="admin-tabs">
      <NavLink
        to="/events"
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

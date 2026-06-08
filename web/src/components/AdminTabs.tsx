import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// editor 以上 + 管理者モードのときだけ表示する 2 タブナビ。
// 「ユーザー」タブは /admin/users への導線で、現状 API は sysadmin 限定。
// editor が踏んだ場合は権限エラーで弾かれる前提だが、legacy では editor にも
// ユーザータブが見えていたため、視認性は揃えておく。
export function AdminTabs() {
  const { user, viewMode } = useAuth();
  if (!user) return null;
  if (user.role !== 'sysadmin' && user.role !== 'editor') return null;
  if (viewMode === 'user') return null;
  // editor には /admin/users への導線が要らないので 1 タブだけ出す
  // (タブ 1 つでも legacy の admin-tabs を維持しておくと、admin モードに
  //  入っている事自体が画面上で分かる)
  const showUserTab = user.role === 'sysadmin';
  return (
    <div className="admin-tabs">
      <NavLink
        to="/events"
        className={({ isActive }) => 'admin-tab' + (isActive ? ' active' : '')}
      >
        イベント
      </NavLink>
      {showUserTab && (
        <NavLink
          to="/admin/users"
          className={({ isActive }) =>
            'admin-tab' + (isActive ? ' active' : '')
          }
        >
          ユーザー
        </NavLink>
      )}
    </div>
  );
}

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../auth/AuthContext';

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="app-frame">
        <div className="screen">
          <p>読込中...</p>
        </div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  // ModeToggle (ユーザー/管理者 切替) は HomePage (/events) 内でのみ表示する。
  // 他の画面で切り替えるとモード不整合のバグが起きやすいため、切替面を絞っている。
  return (
    <div className="app-frame">
      <Topbar />
      <Outlet />
    </div>
  );
}

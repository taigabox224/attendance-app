import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const ROLE_LABEL: Record<string, string> = {
  sysadmin: 'システム管理者',
  editor: '編集者',
  viewer: '閲覧者',
};

export function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1 className="screen-title">ホーム</h1>
        <p className="screen-sub">
          {user.name} ({ROLE_LABEL[user.role] ?? user.role})
        </p>
      </header>

      <div className="action-stack" style={{ marginTop: 0 }}>
        <Link to="/events" className="link-button">
          イベント
        </Link>
        {user.role === 'sysadmin' && (
          <Link to="/admin/users" className="link-button">
            ユーザー管理
          </Link>
        )}
        <button className="secondary" onClick={onLogout}>
          ログアウト
        </button>
      </div>
    </div>
  );
}

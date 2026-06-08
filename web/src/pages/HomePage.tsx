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
    <div className="app-frame">
      <h1>ようこそ</h1>
      <dl className="user-info">
        <dt>お名前</dt>
        <dd>{user.name}</dd>
        <dt>メールアドレス</dt>
        <dd className="mono">{user.email}</dd>
        <dt>ロール</dt>
        <dd>{ROLE_LABEL[user.role] ?? user.role}</dd>
      </dl>

      <div className="action-stack">
        <Link to="/change-password" className="link-button">
          パスワードを変更
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

      <p className="note" style={{ marginTop: 32 }}>
        Phase 2 着手中。出欠機能は Phase 1 のプロトタイプ (web/legacy/) から
        順次移植予定です。
      </p>
    </div>
  );
}

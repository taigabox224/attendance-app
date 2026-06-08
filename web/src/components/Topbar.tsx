import { Link } from 'react-router-dom';
import { useAuth, type Role } from '../auth/AuthContext';

const ROLE_LABEL: Record<Role, string> = {
  sysadmin: 'システム管理者',
  editor: '編集者',
  viewer: '閲覧者',
};

function avatarInitial(name: string): string {
  if (!name) return '?';
  // 全角文字でも 1 文字目を採用 (日本語名想定)
  return Array.from(name)[0] ?? '?';
}

export function Topbar() {
  const { user } = useAuth();

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="brand-logo" aria-hidden="true" />
        <span className="brand-text">
          <span className="brand-text-line1">流山青年会議所</span>
          <span className="brand-text-line2">イベント管理アプリ</span>
        </span>
      </Link>

      {user && (
        <Link to="/change-password" className="role-pill" aria-label="プロフィール">
          <span className="avatar">{avatarInitial(user.name)}</span>
          <span className="label">
            <span className="name">{user.name}</span>
            <span className="role">{ROLE_LABEL[user.role]}</span>
          </span>
        </Link>
      )}
    </header>
  );
}

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { Role } from '../auth/AuthContext';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  department: string | null;
  title: string | null;
  email_verified_at: string | null;
  must_change_password: boolean;
  created_at: string;
}

const ROLE_OPTIONS: ReadonlyArray<{ value: Role; label: string }> = [
  { value: 'sysadmin', label: 'システム管理者' },
  { value: 'editor', label: '編集者' },
  { value: 'viewer', label: '閲覧者' },
];

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const data = await api<{ users: AdminUser[] }>('/api/admin/users');
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function onChangeRole(userId: string, role: Role) {
    setError(null);
    try {
      await api(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await loadUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    }
  }

  async function onDelete(user: AdminUser) {
    const ok = window.confirm(
      `${user.name} (${user.email}) を削除しますか?\nこの操作は取り消せません。`,
    );
    if (!ok) return;
    setError(null);
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      await loadUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    }
  }

  return (
    <div className="app-frame">
      <p>
        <Link to="/">← ホームへ</Link>
      </p>
      <h1>ユーザー管理</h1>

      {error && <p className="error">{error}</p>}

      {!showForm && (
        <button onClick={() => setShowForm(true)} style={{ marginBottom: 24 }}>
          新規ユーザー作成
        </button>
      )}

      {showForm && (
        <CreateUserForm
          onCreated={() => {
            setShowForm(false);
            void loadUsers();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <p>読込中...</p>
      ) : users.length === 0 ? (
        <p className="note">登録ユーザーがいません。</p>
      ) : (
        <ul className="user-list">
          {users.map((u) => (
            <li key={u.id} className="user-row">
              <div className="user-row-head">
                <strong>{u.name}</strong>
                <span className="mono muted">{u.email}</span>
              </div>
              <div className="user-row-meta">
                {u.department && <span>{u.department}</span>}
                {u.title && <span>{u.title}</span>}
                {u.must_change_password && <span className="warn">仮PW未変更</span>}
                {!u.email_verified_at && <span className="warn">メール未認証</span>}
              </div>
              <div className="user-row-actions">
                <select
                  value={u.role}
                  onChange={(e) => onChangeRole(u.id, e.target.value as Role)}
                  aria-label={`${u.name} のロール`}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button className="danger" onClick={() => onDelete(u)}>
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface CreateUserFormProps {
  onCreated: () => void;
  onCancel: () => void;
}

function CreateUserForm({ onCreated, onCancel }: CreateUserFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [department, setDepartment] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          name,
          role,
          department: department || null,
          title: title || null,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信エラー');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="form-stack"
      style={{ marginBottom: 24, padding: 16, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)' }}
    >
      <h2 style={{ margin: '0 0 4px' }}>新規ユーザー</h2>
      <p className="note" style={{ margin: 0 }}>
        仮パスワードを発行してメール送信します。
      </p>
      <div className="field">
        <label htmlFor="cu-email">メールアドレス</label>
        <input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="cu-name">お名前</label>
        <input id="cu-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="cu-role">ロール</label>
        <select id="cu-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="cu-dept">委員会 (任意)</label>
        <input id="cu-dept" type="text" value={department} onChange={(e) => setDepartment(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="cu-title">役職 (任意)</label>
        <input id="cu-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      <div style={{ display: 'flex', gap: 12 }}>
        <button type="submit" disabled={submitting} style={{ flex: 1 }}>
          {submitting ? '作成中...' : '作成してメール送信'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

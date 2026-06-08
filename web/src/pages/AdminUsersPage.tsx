import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import { type Role } from '../auth/AuthContext';
import { AdminTabs } from '../components/AdminTabs';
import { UserEditModal, type EditableUser } from '../components/UserEditModal';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  family_name: string | null;
  given_name: string | null;
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

const ROLE_LABEL_MAP: Record<Role, string> = {
  sysadmin: 'システム管理者',
  editor: '編集者',
  viewer: '閲覧者',
};

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<EditableUser | null>(null);

  // フィルタ用 state
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set());
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');

  const [departments, setDepartments] = useState<string[]>([]);

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
    api<{ departments: string[] }>('/api/masters')
      .then((d) => setDepartments(d.departments))
      .catch(() => {
        /* フィルタは無効化 */
      });
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (deptFilter.size > 0) {
        if (!u.department || !deptFilter.has(u.department)) return false;
      }
      if (q) {
        const hay = `${u.name}|${u.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, query, deptFilter, roleFilter]);

  function toggleDept(d: string) {
    setDeptFilter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function resetFilters() {
    setQuery('');
    setDeptFilter(new Set());
    setRoleFilter('all');
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

  const hasActiveFilter =
    query !== '' || deptFilter.size > 0 || roleFilter !== 'all';

  return (
    <div className="screen">
      <AdminTabs />
      <header className="screen-header">
        <h1 className="screen-title">ユーザー管理</h1>
        <p className="screen-sub">
          全 {users.length} 名 / 表示中 {filteredUsers.length} 名
        </p>
      </header>

      {error && <p className="error">{error}</p>}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{ marginBottom: 16 }}
        >
          + 新規ユーザー作成
        </button>
      )}

      {showForm && (
        <CreateUserForm
          departments={departments}
          onCreated={() => {
            setShowForm(false);
            void loadUsers();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* ===== フィルタ ===== */}
      <div className="user-filter">
        <input
          type="search"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前 / メールで検索..."
        />

        <div className="filter-label">ロール</div>
        <div className="filter-chips">
          <button
            type="button"
            className={`chip ${roleFilter === 'all' ? 'active' : ''}`}
            onClick={() => setRoleFilter('all')}
          >
            全て
          </button>
          {ROLE_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`chip ${roleFilter === r.value ? 'active' : ''}`}
              onClick={() => setRoleFilter(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {departments.length > 0 && (
          <>
            <div className="filter-label">委員会</div>
            <div className="filter-chips">
              {departments.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`chip ${deptFilter.has(d) ? 'active' : ''}`}
                  onClick={() => toggleDept(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </>
        )}

        {hasActiveFilter && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={resetFilters}
            style={{ marginTop: 4 }}
          >
            フィルタを解除
          </button>
        )}
      </div>

      {loading ? (
        <p>読込中...</p>
      ) : users.length === 0 ? (
        <p className="note">登録ユーザーがいません。</p>
      ) : filteredUsers.length === 0 ? (
        <div className="empty-state">
          <div className="glyph">○</div>
          <div className="hint">該当ユーザーがいません</div>
        </div>
      ) : (
        <ul className="user-list">
          {filteredUsers.map((u) => (
            <li key={u.id} className="user-row">
              <div className="user-row-head">
                <strong>{u.name}</strong>
                <span className="mono muted">{u.email}</span>
              </div>
              <div className="user-row-meta">
                <span>{ROLE_LABEL_MAP[u.role]}</span>
                {u.department && <span>{u.department}</span>}
                {u.title && <span>{u.title}</span>}
                {u.must_change_password && (
                  <span className="warn">仮PW未変更</span>
                )}
                {!u.email_verified_at && (
                  <span className="warn">メール未認証</span>
                )}
              </div>
              <div className="user-row-actions">
                <button
                  className="btn-outline btn-sm"
                  onClick={() =>
                    setEditing({
                      id: u.id,
                      email: u.email,
                      name: u.name,
                      family_name: u.family_name,
                      given_name: u.given_name,
                      role: u.role,
                      department: u.department,
                      title: u.title,
                    })
                  }
                  style={{ flex: 1 }}
                >
                  編集
                </button>
                <button
                  className="danger btn-sm"
                  onClick={() => onDelete(u)}
                >
                  削除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <UserEditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={loadUsers}
        />
      )}
    </div>
  );
}

interface CreateUserFormProps {
  departments: string[];
  onCreated: () => void;
  onCancel: () => void;
}

function CreateUserForm({ departments, onCreated, onCancel }: CreateUserFormProps) {
  const [email, setEmail] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [givenName, setGivenName] = useState('');
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
          family_name: familyName,
          given_name: givenName,
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
      style={{
        marginBottom: 24,
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface)',
      }}
    >
      <h2 style={{ margin: '0 0 4px' }}>新規ユーザー</h2>
      <p className="note" style={{ margin: 0 }}>
        仮パスワードを発行してメール送信します。
      </p>
      <div className="field">
        <label htmlFor="cu-email">メールアドレス <span className="required-mark">*</span></label>
        <input
          id="cu-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="cu-family">苗字 <span className="required-mark">*</span></label>
          <input
            id="cu-family"
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            autoComplete="family-name"
            maxLength={40}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="cu-given">名前 <span className="required-mark">*</span></label>
          <input
            id="cu-given"
            type="text"
            value={givenName}
            onChange={(e) => setGivenName(e.target.value)}
            autoComplete="given-name"
            maxLength={40}
            required
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="cu-role">ロール <span className="required-mark">*</span></label>
        <select
          id="cu-role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="cu-dept">委員会 <span className="optional-mark">任意</span></label>
        {departments.length > 0 ? (
          <select
            id="cu-dept"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="">未指定</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        ) : (
          <input
            id="cu-dept"
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        )}
      </div>
      <div className="field">
        <label htmlFor="cu-title">役職 <span className="optional-mark">任意</span></label>
        <input
          id="cu-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="action-row">
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

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import { type Role } from '../auth/AuthContext';
import { AdminSettingsMenu } from '../components/AdminSettingsMenu';
import { AdminTabs } from '../components/AdminTabs';
import {
  UserEditModal,
  type EditableUser,
  type UserStatus,
} from '../components/UserEditModal';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  family_name: string | null;
  given_name: string | null;
  role: Role;
  department: string | null;
  title: string | null;
  status: UserStatus;
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

const STATUS_OPTIONS: ReadonlyArray<{ value: UserStatus | 'all'; label: string }> = [
  { value: 'active', label: 'アクティブ' },
  { value: 'inactive', label: '休会' },
  { value: 'left', label: '退会' },
  { value: 'all', label: '全て' },
];

const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'アクティブ',
  inactive: '休会',
  left: '退会',
};

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<EditableUser | null>(null);

  // フィルタ
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set());
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('active');

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
        /* マスター未取得時はフィルタなし */
      });
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
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
  }, [users, query, deptFilter, roleFilter, statusFilter]);

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
    setStatusFilter('active');
  }

  const hasActiveFilter =
    query !== '' ||
    deptFilter.size > 0 ||
    roleFilter !== 'all' ||
    statusFilter !== 'active';

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

      <div className="action-row" style={{ marginBottom: 12 }}>
        <button
          onClick={() => setShowForm(true)}
          disabled={showForm}
          style={{ flex: 1 }}
        >
          + 新規ユーザー作成
        </button>
        <button
          className="btn-outline"
          onClick={() => setShowSettings(true)}
          type="button"
        >
          ⚙ 設定
        </button>
      </div>

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

      {/* フィルタ */}
      <div className="user-filter">
        <input
          type="search"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前 / メールで検索..."
        />

        <div className="filter-label">ステータス</div>
        <div className="filter-chips">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`chip ${statusFilter === s.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>

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
        <div className="compact-user-list">
          {filteredUsers.map((u) => (
            <button
              key={u.id}
              type="button"
              className="user-row-compact"
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
                  status: u.status,
                })
              }
            >
              <span className="user-row-avatar">{firstChar(u.name)}</span>
              <span className="user-row-body">
                <span className="user-row-name">{u.name}</span>
                <span className="user-row-sub">
                  <span>{ROLE_LABEL_MAP[u.role]}</span>
                  {u.department && <span>· {u.department}</span>}
                  {u.title && <span>· {u.title}</span>}
                </span>
              </span>
              <span className="user-row-tags">
                {u.status !== 'active' && (
                  <span
                    className={`status-badge ${u.status === 'left' ? 'badge-no' : 'badge-pending'}`}
                  >
                    {STATUS_LABEL[u.status]}
                  </span>
                )}
                {u.must_change_password && (
                  <span className="badge warn">仮PW</span>
                )}
                {!u.email_verified_at && (
                  <span className="badge warn">未認証</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <UserEditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={loadUsers}
        />
      )}

      {showSettings && (
        <AdminSettingsMenu onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function firstChar(name: string): string {
  if (!name) return '?';
  return Array.from(name)[0] ?? '?';
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
        marginBottom: 16,
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

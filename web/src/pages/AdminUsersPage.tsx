import { useCallback, useEffect, useMemo, useState } from 'react';
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

const ROLE_LABEL: Record<Role, string> = {
  sysadmin: 'システム管理者',
  editor: '編集者',
  viewer: '閲覧者',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'アクティブ',
  inactive: '休会',
  left: '退会',
};

type UserStatusFilter = UserStatus | 'all';

const STATUS_CHIPS: ReadonlyArray<{ value: UserStatusFilter; label: string }> = [
  { value: 'active', label: 'アクティブ' },
  { value: 'inactive', label: '休会' },
  { value: 'left', label: '退会' },
  { value: 'all', label: '全て' },
];

function initial(name: string): string {
  return Array.from((name || '?').trim())[0] ?? '?';
}

function roleAvatarColor(role: Role): string {
  if (role === 'sysadmin') return 'var(--text)';
  if (role === 'editor') return 'var(--primary)';
  return 'var(--accent)';
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);

  const [editing, setEditing] = useState<EditableUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // フィルタ (legacy adminUserFilter)
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('active');
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set());
  const [titleFilter, setTitleFilter] = useState<string>('');

  // 複数選択 (一括変更)
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [bulkField, setBulkField] = useState<
    'status' | 'department' | 'title' | null
  >(null);

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
    void loadUsers();
    api<{ departments: string[]; titles: string[] }>('/api/masters')
      .then((d) => {
        setDepartments(d.departments);
        setTitles(d.titles);
      })
      .catch(() => {
        /* マスターなしでも表示は続行 */
      });
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (deptFilter.size > 0) {
        if (!u.department || !deptFilter.has(u.department)) return false;
      }
      if (titleFilter && u.title !== titleFilter) return false;
      if (q) {
        const hay = `${u.name}|${u.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, query, statusFilter, deptFilter, titleFilter]);

  // 表示中のユーザに合わせて、不正な選択 ID を除去
  useEffect(() => {
    setSelection((prev) => {
      const visible = new Set(filteredUsers.map((u) => u.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filteredUsers]);

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
    setStatusFilter('active');
    setDeptFilter(new Set());
    setTitleFilter('');
  }

  const hasActiveFilter =
    query !== '' ||
    statusFilter !== 'active' ||
    deptFilter.size > 0 ||
    titleFilter !== '';

  function toggleSelection(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelection(new Set(filteredUsers.map((u) => u.id)));
  }

  function clearSelection() {
    setSelection(new Set());
  }

  function rowToEditable(u: AdminUser): EditableUser {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      family_name: u.family_name,
      given_name: u.given_name,
      role: u.role,
      department: u.department,
      title: u.title,
      status: u.status,
    };
  }

  return (
    <div className="screen">
      <AdminTabs />
      <div className="screen-header header-row">
        <div>
          <h1 className="screen-title">ユーザー一覧</h1>
          <p className="screen-sub">
            登録ユーザーを委員会・役職で絞り込みできます
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 6,
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="btn-sm"
            onClick={() => setCreating(true)}
          >
            + ユーザー登録
          </button>
          <button
            type="button"
            className="gear-btn"
            onClick={() => setShowSettings(true)}
            aria-label="設定"
            title="設定"
          >
            ⚙
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {/* フィルタ */}
      <div id="admin-user-filter">
        <input
          type="search"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前で検索"
        />
        <div className="filter-chips" style={{ marginTop: 8 }}>
          {STATUS_CHIPS.map((s) => (
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

        {departments.length > 0 && (
          <>
            <div className="filter-section-label">委員会(複数選択可)</div>
            <div className="multiselect-chips">
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

        {titles.length > 0 && (
          <>
            <div className="filter-section-label">役職</div>
            <div className="filter-selects" style={{ marginTop: 4 }}>
              <select
                value={titleFilter}
                onChange={(e) => setTitleFilter(e.target.value)}
              >
                <option value="">役職(全て)</option>
                {titles.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 10,
            fontSize: 12,
            color: 'var(--text-mute)',
          }}
        >
          <span>
            {filteredUsers.length === users.length
              ? `${users.length} 件`
              : `${filteredUsers.length} / ${users.length} 件`}
          </span>
          {hasActiveFilter && (
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={resetFilters}
            >
              フィルタをリセット
            </button>
          )}
        </div>
      </div>

      {selection.size > 0 && (
        <div className="bulk-bar">
          <div className="bulk-bar-left">
            <strong>{selection.size}件</strong>選択中
          </div>
          <div className="bulk-bar-actions">
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={selectAllVisible}
            >
              全選択
            </button>
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={clearSelection}
            >
              解除
            </button>
          </div>
          <div className="bulk-bar-actions">
            <button
              type="button"
              className="btn-sm"
              onClick={() => setBulkField('status')}
            >
              ステータス変更
            </button>
            <button
              type="button"
              className="btn-sm"
              onClick={() => setBulkField('department')}
            >
              委員会変更
            </button>
            <button
              type="button"
              className="btn-sm"
              onClick={() => setBulkField('title')}
            >
              役職変更
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p>読込中...</p>
      ) : filteredUsers.length === 0 ? (
        <div className="empty-state" style={{ padding: '32px 0' }}>
          <div className="hint">条件に一致するユーザはいません</div>
        </div>
      ) : (
        <div>
          {filteredUsers.map((u) => {
            const elevated = u.role === 'sysadmin' || u.role === 'editor';
            const checked = selection.has(u.id);
            return (
              <div
                key={u.id}
                className={`user-row ${checked ? 'is-selected' : ''}`}
                onClick={() => setEditing(rowToEditable(u))}
                style={{ cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  className="user-select"
                  checked={checked}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(u.id);
                  }}
                  onChange={() => {
                    /* handled via onClick */
                  }}
                />
                <div
                  className="avatar"
                  style={{
                    background: roleAvatarColor(u.role),
                    color: 'white',
                  }}
                >
                  {initial(u.name)}
                </div>
                <div className="info">
                  <div className="name">
                    {u.name}
                    {elevated && (
                      <span className={`role-pill-mini ${u.role}`}>
                        {ROLE_LABEL[u.role]}
                      </span>
                    )}
                    {u.status !== 'active' && (
                      <span className={`user-status-pill ${u.status}`}>
                        {STATUS_LABEL[u.status]}
                      </span>
                    )}
                  </div>
                  <div className="meta">
                    <span className={u.department ? '' : 'placeholder'}>
                      {u.department || '委員会未設定'}
                    </span>
                    <span>·</span>
                    <span>{u.title || 'メンバー'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <UserEditModal
          user={null}
          onClose={() => setCreating(false)}
          onSaved={loadUsers}
        />
      )}

      {editing && (
        <UserEditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={loadUsers}
        />
      )}

      {bulkField && (
        <BulkEditModal
          field={bulkField}
          selectedIds={[...selection]}
          departments={departments}
          titles={titles}
          onClose={() => setBulkField(null)}
          onApplied={async () => {
            setBulkField(null);
            setSelection(new Set());
            await loadUsers();
          }}
        />
      )}

      {showSettings && (
        <AdminSettingsMenu onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

// 一括変更モーダル: 選択 ID に対して status / department / title を一括 PATCH する。
// 専用エンドポイントを作らずクライアント側でループしている (件数は通常 < 数十)。
function BulkEditModal({
  field,
  selectedIds,
  departments,
  titles,
  onClose,
  onApplied,
}: {
  field: 'status' | 'department' | 'title';
  selectedIds: string[];
  departments: string[];
  titles: string[];
  onClose: () => void;
  onApplied: () => Promise<void> | void;
}) {
  const [value, setValue] = useState<string>(() => {
    if (field === 'status') return 'active';
    return '';
  });
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fieldLabel =
    field === 'status' ? 'ステータス' : field === 'department' ? '委員会' : '役職';

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (field === 'status') {
        body.status = value as UserStatus;
      } else if (field === 'department') {
        body.department = value || null;
      } else {
        body.title = value || null;
      }
      for (const id of selectedIds) {
        await api(`/api/admin/users/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      await onApplied();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" aria-hidden="true" />
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="閉じる"
        >
          ×
        </button>
        <h2>{fieldLabel}を一括変更</h2>
        <p className="note" style={{ margin: '0 0 14px' }}>
          選択中の {selectedIds.length} 名の{fieldLabel}を変更します。
        </p>
        <div className="field">
          <label htmlFor="bulk-value">{fieldLabel}</label>
          {field === 'status' ? (
            <select
              id="bulk-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="active">アクティブ</option>
              <option value="inactive">休会</option>
              <option value="left">退会</option>
            </select>
          ) : field === 'department' ? (
            <select
              id="bulk-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="">未指定</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <select
              id="bulk-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="">未指定</option>
              {titles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="action-row" style={{ marginTop: 12 }}>
          <button type="button" onClick={apply} disabled={applying}>
            {applying ? '適用中...' : '適用する'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={applying}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import { ROLES, useAuth, type Role } from '../auth/AuthContext';

export type UserStatus = 'active' | 'inactive' | 'left';

export interface EditableUser {
  id: string;
  email: string;
  name: string;
  family_name: string | null;
  given_name: string | null;
  role: Role;
  department: string | null;
  title: string | null;
  status: UserStatus;
}

interface Props {
  // user=null で「新規ユーザー登録」モーダル
  user: EditableUser | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const ROLE_LABEL: Record<Role, string> = {
  sysadmin: 'システム管理者',
  editor: '編集者',
  viewer: '閲覧者',
};

const STATUS_OPTIONS: ReadonlyArray<{ value: UserStatus; label: string }> = [
  { value: 'active', label: 'アクティブ' },
  { value: 'inactive', label: '休会' },
  { value: 'left', label: '退会' },
];

export function UserEditModal({ user, onClose, onSaved }: Props) {
  const { user: currentUser } = useAuth();
  const isCreate = user === null;
  const isSelf = !isCreate && currentUser?.id === user.id;

  const [familyName, setFamilyName] = useState(user?.family_name ?? '');
  const [givenName, setGivenName] = useState(user?.given_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'viewer');
  const [department, setDepartment] = useState(user?.department ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [status, setStatus] = useState<UserStatus>(user?.status ?? 'active');
  const [departments, setDepartments] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ departments: string[]; titles: string[] }>('/api/masters')
      .then((d) => {
        setDepartments(d.departments);
        setTitles(d.titles);
      })
      .catch(() => {
        // フォールバックは text input
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (isCreate) {
        // 新規作成: 仮パスワード発行 + メール送信
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
      } else {
        const body: Record<string, unknown> = {};
        if (familyName !== (user.family_name ?? ''))
          body.family_name = familyName;
        if (givenName !== (user.given_name ?? '')) body.given_name = givenName;
        if (email !== user.email) body.email = email;
        if (role !== user.role) body.role = role;
        if ((department || null) !== (user.department || null))
          body.department = department || null;
        if ((title || null) !== (user.title || null))
          body.title = title || null;
        if (status !== user.status) body.status = status;

        if (Object.keys(body).length === 0) {
          onClose();
          return;
        }

        await api(`/api/admin/users/${user.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
    } finally {
      setSaving(false);
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
        <h2>{isCreate ? 'ユーザー登録' : 'ユーザー編集'}</h2>
        {isCreate && (
          <p className="note" style={{ margin: '0 0 14px' }}>
            仮パスワードを発行してメール送信します。
          </p>
        )}

        <form onSubmit={onSubmit} className="form-stack">
          <div className="field-row">
            <div className="field">
              <label htmlFor="ue-family">姓 <span className="required-mark">*</span></label>
              <input
                id="ue-family"
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                maxLength={40}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ue-given">名 <span className="required-mark">*</span></label>
              <input
                id="ue-given"
                type="text"
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                maxLength={40}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="ue-email">メールアドレス <span className="required-mark">*</span></label>
            <input
              id="ue-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="ue-role">ロール <span className="required-mark">*</span></label>
            <select
              id="ue-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="ue-dept">委員会 <span className="optional-mark">任意</span></label>
            {departments.length > 0 ? (
              <select
                id="ue-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                <option value="">未指定</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
                {department && !departments.includes(department) && (
                  <option value={department}>{department} (登録外)</option>
                )}
              </select>
            ) : (
              <input
                id="ue-dept"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            )}
          </div>

          {!isCreate && (
            <div className="field">
              <label htmlFor="ue-status">ステータス <span className="required-mark">*</span></label>
              <select
                id="ue-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as UserStatus)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <label htmlFor="ue-title">役職 <span className="optional-mark">任意</span></label>
            {titles.length > 0 ? (
              <select
                id="ue-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              >
                <option value="">未指定</option>
                {titles.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {title && !titles.includes(title) && (
                  <option value={title}>{title} (登録外)</option>
                )}
              </select>
            ) : (
              <input
                id="ue-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </div>

          {error && <p className="error">{error}</p>}

          <div className="action-row">
            <button type="submit" disabled={saving || deleting}>
              {saving
                ? isCreate
                  ? '作成中...'
                  : '保存中...'
                : isCreate
                  ? '作成してメール送信'
                  : '保存'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onClose}
              disabled={saving || deleting}
            >
              キャンセル
            </button>
          </div>
        </form>

        {!isCreate && !isSelf && (
          <>
            <hr
              style={{
                margin: '24px 0 16px',
                border: 'none',
                borderTop: '1px solid var(--border)',
              }}
            />
            <button
              type="button"
              className="danger"
              disabled={saving || deleting}
              onClick={async () => {
                if (isCreate) return;
                const ok = window.confirm(
                  `${user.name} (${user.email}) を削除しますか?\n` +
                    `この操作は取り消せません。\n` +
                    `※ 一時的にアプリから外す場合は「ステータス: 休会/退会」を検討してください。`,
                );
                if (!ok) return;
                setDeleting(true);
                setError(null);
                try {
                  await api(`/api/admin/users/${user.id}`, { method: 'DELETE' });
                  await onSaved();
                  onClose();
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : '通信エラー');
                  setDeleting(false);
                }
              }}
              style={{ width: '100%' }}
            >
              {deleting ? '削除中...' : 'このユーザーを削除'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

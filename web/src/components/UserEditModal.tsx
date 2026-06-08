import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import { ROLES, type Role } from '../auth/AuthContext';

export interface EditableUser {
  id: string;
  email: string;
  name: string;
  family_name: string | null;
  given_name: string | null;
  role: Role;
  department: string | null;
  title: string | null;
}

interface Props {
  user: EditableUser;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const ROLE_LABEL: Record<Role, string> = {
  sysadmin: 'システム管理者',
  editor: '編集者',
  viewer: '閲覧者',
};

export function UserEditModal({ user, onClose, onSaved }: Props) {
  const [familyName, setFamilyName] = useState(user.family_name ?? '');
  const [givenName, setGivenName] = useState(user.given_name ?? '');
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [department, setDepartment] = useState(user.department ?? '');
  const [title, setTitle] = useState(user.title ?? '');
  const [departments, setDepartments] = useState<string[]>([]);
  const [titles, setTitles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
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

    const body: Record<string, unknown> = {};
    if (familyName !== (user.family_name ?? '')) body.family_name = familyName;
    if (givenName !== (user.given_name ?? '')) body.given_name = givenName;
    if (email !== user.email) body.email = email;
    if (role !== user.role) body.role = role;
    if ((department || null) !== (user.department || null))
      body.department = department || null;
    if ((title || null) !== (user.title || null)) body.title = title || null;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    try {
      await api(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
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
        <h2>ユーザー編集</h2>

        <form onSubmit={onSubmit} className="form-stack">
          <div className="field-row">
            <div className="field">
              <label htmlFor="ue-family">苗字 <span className="required-mark">*</span></label>
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
              <label htmlFor="ue-given">名前 <span className="required-mark">*</span></label>
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
            <button type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

interface Props {
  onClose: () => void;
}

// 自身の姓名のみ編集可能。委員会・役職は読み取り専用 (legacy openProfileModal 仕様)。
export function ProfileEditModal({ onClose }: Props) {
  const { user, refresh } = useAuth();
  const [familyName, setFamilyName] = useState(user?.family_name ?? '');
  const [givenName, setGivenName] = useState(user?.given_name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!familyName.trim() || !givenName.trim()) {
      setError('姓と名は必須です');
      return;
    }
    setSaving(true);
    try {
      await api('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          family_name: familyName.trim(),
          given_name: givenName.trim(),
        }),
      });
      await refresh();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '通信エラー');
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
        <h2>プロフィール編集</h2>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-mute)',
            margin: '0 0 14px',
          }}
        >
          お名前は姓と名に分けて入力します。委員会と役職の変更は管理者にご依頼ください。
        </p>

        <form onSubmit={onSubmit} className="form-stack">
          <div className="field">
            <label>
              お名前 <span className="required-mark">*</span>
            </label>
            <div className="field-row" style={{ gap: 6 }}>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="姓"
                autoComplete="family-name"
                style={{ flex: 1 }}
                maxLength={40}
              />
              <input
                type="text"
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                placeholder="名"
                autoComplete="given-name"
                style={{ flex: 1 }}
                maxLength={40}
              />
            </div>
          </div>

          <div className="field">
            <label>委員会</label>
            <div className="readonly-field">{user.department || '未設定'}</div>
          </div>

          <div className="field">
            <label>役職</label>
            <div className="readonly-field">{user.title || 'メンバー'}</div>
          </div>

          {error && <p className="error">{error}</p>}

          <div
            className="action-row"
            style={{ marginTop: 14, display: 'flex', gap: 8 }}
          >
            <button
              type="button"
              className="btn-outline"
              onClick={onClose}
              style={{ flex: 1 }}
              disabled={saving}
            >
              キャンセル
            </button>
            <button type="submit" style={{ flex: 1 }} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function ChangePasswordPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('新しいパスワードと確認用が一致しません');
      return;
    }
    if (newPassword.length < 8) {
      setError('新しいパスワードは8文字以上にしてください');
      return;
    }
    setSubmitting(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      await refresh();
      navigate('/events', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1 className="screen-title">パスワード変更</h1>
      </header>
      {user?.must_change_password && (
        <p className="note">
          仮パスワードが設定されています。新しいパスワードに変更してください。
        </p>
      )}
      <form onSubmit={onSubmit} className="form-stack">
        <div className="field">
          <label htmlFor="current_password">現在のパスワード <span className="required-mark">*</span></label>
          <input
            id="current_password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="new_password">新しいパスワード (8文字以上) <span className="required-mark">*</span></label>
          <input
            id="new_password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="confirm">新しいパスワード (確認) <span className="required-mark">*</span></label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div
          className="action-row"
          style={{ marginTop: 14, display: 'flex', gap: 8 }}
        >
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate(-1)}
            disabled={submitting || !!user?.must_change_password}
            style={{ flex: 1 }}
            title={
              user?.must_change_password
                ? '仮パスワードのまま閉じることはできません'
                : undefined
            }
          >
            キャンセル
          </button>
          <button type="submit" disabled={submitting} style={{ flex: 1 }}>
            {submitting ? '更新中...' : 'パスワードを変更'}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api/client';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [givenName, setGivenName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          family_name: familyName,
          given_name: givenName,
          password,
        }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="app-frame">
        <h1>登録メールを送信しました</h1>
        <p>
          <span className="mono">{email}</span> 宛に認証用URLを記載したメールを送信しました。
          受信箱を確認し、URLにアクセスして登録を完了してください。
        </p>
        <p className="note">URLの有効期限は24時間です。</p>
        <p style={{ marginTop: 24 }}>
          <Link to="/login">ログイン画面へ</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <h1>新規登録</h1>
      <form onSubmit={onSubmit} className="form-stack">
        <div className="field">
          <label htmlFor="email">メールアドレス <span className="required-mark">*</span></label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="family_name">姓 <span className="required-mark">*</span></label>
            <input
              id="family_name"
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              autoComplete="family-name"
              maxLength={40}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="given_name">名 <span className="required-mark">*</span></label>
            <input
              id="given_name"
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
          <label htmlFor="password">パスワード (8文字以上) <span className="required-mark">*</span></label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? '送信中...' : '登録メールを送信'}
        </button>
      </form>
      <p className="note" style={{ marginTop: 24 }}>
        既にアカウントをお持ちの方は <Link to="/login">ログイン</Link> へ
      </p>
    </div>
  );
}

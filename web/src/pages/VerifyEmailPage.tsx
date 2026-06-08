import { Link, useSearchParams } from 'react-router-dom';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const status = params.get('status');

  if (status === 'ok') {
    return (
      <div className="app-frame">
        <h1>メール認証完了</h1>
        <p className="success">
          メールアドレスの認証が完了しました。
        </p>
        <p style={{ marginTop: 24 }}>
          <Link to="/login">ログイン画面へ</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <h1>メール認証に失敗しました</h1>
      <p className="error">
        URLが無効か、有効期限が切れている可能性があります。お手数ですが再度登録手続きをお試しください。
      </p>
      <p style={{ marginTop: 24 }}>
        <Link to="/register">新規登録へ</Link>
      </p>
    </div>
  );
}

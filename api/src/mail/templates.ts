export interface MailUser {
  name: string;
  email: string;
}

export interface MailContent {
  subject: string;
  text: string;
}

function appUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error('APP_URL is not set');
  return url;
}

export function verificationEmail(user: MailUser, token: string): MailContent {
  const url = `${appUrl()}/api/auth/verify-email?token=${token}`;
  return {
    subject: '【流山JC 出欠管理】メールアドレスの認証',
    text:
      `${user.name} 様\n\n` +
      `下記URLにアクセスしてメール認証を完了してください。\n` +
      `${url}\n\n` +
      `このURLは24時間で無効になります。\n` +
      `心当たりがない場合はこのメールを破棄してください。`,
  };
}

export function tempPasswordEmail(user: MailUser, tempPassword: string): MailContent {
  return {
    subject: '【流山JC 出欠管理】アカウントが作成されました',
    text:
      `${user.name} 様\n\n` +
      `管理者によりアカウントが作成されました。\n\n` +
      `ログインURL: ${appUrl()}/login\n` +
      `メールアドレス: ${user.email}\n` +
      `仮パスワード: ${tempPassword}\n\n` +
      `初回ログイン後、パスワードの変更をお願いします。`,
  };
}

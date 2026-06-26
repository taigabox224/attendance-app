# AUTH_FEATURE.md

認証機能の実装仕様。

CLAUDE.md / PRODUCTION.md と合わせて参照すること。本ドキュメントは Phase 2 のスタック(TypeScript / Fastify / PostgreSQL / React+Vite / モノレポ `/api` `/web`)を前提とする。

## 概要

メール認証ベースのユーザー登録・ログイン機能。ユーザー登録経路は2つ。

1. **sysadmin 経由**: 画面から登録 → 仮パスワード付きメール送信 → 初回ログイン時に変更必須
2. **一般登録**: ログイン画面から自己登録 → 認証URL付きメール送信 → クリックで認証完了

セッションは JWT(HTTPOnly Cookie)で管理。3階層のロール(sysadmin / editor / viewer)で権限を分ける。

## 技術スタック

### バックエンド (`/api`)
- **Node.js** (LTS) + **TypeScript**
- **Fastify** (Express も可、本書のサンプルは Fastify ベース)
- **PostgreSQL** (`pg`) を本番想定。MVP期間は `better-sqlite3` で代替可
- **JWT**: `jsonwebtoken`、HTTPOnly Cookie で送信
- **パスワードハッシュ**: `bcrypt` (cost factor 12)
- **メール送信**: `@aws-sdk/client-sesv2` (Amazon SES)
- **トークン生成**: `crypto.randomBytes`
- **バリデーション**: `zod`(推奨)

### フロントエンド (`/web`)
- **React** + **TypeScript** + **Vite**
- **React Router** で `/login`, `/register`, `/verify-email`, `/change-password` のルーティング
- 認証API呼び出しは `fetch('/api/...')` (Cookieは `credentials: 'include'`)
- Vite dev server で `/api` を `http://localhost:3000` にプロキシ

## ディレクトリ構成

```
.
├── api/
│   ├── src/
│   │   ├── server.ts              # Fastify エントリ
│   │   ├── db.ts                  # DB接続・マイグレーション
│   │   ├── auth/
│   │   │   ├── jwt.ts             # JWT発行・検証
│   │   │   ├── password.ts        # bcrypt ラッパー
│   │   │   ├── tokens.ts          # 認証トークン生成
│   │   │   └── permissions.ts     # ロール権限定義
│   │   ├── mail/
│   │   │   ├── ses.ts             # SES送信
│   │   │   └── templates.ts       # メール本文
│   │   ├── middleware/
│   │   │   ├── requireAuth.ts
│   │   │   ├── requireRole.ts
│   │   │   └── rateLimit.ts
│   │   ├── routes/
│   │   │   ├── auth.ts            # /api/auth/*
│   │   │   └── admin.ts           # /api/admin/*
│   │   ├── schemas/               # zod スキーマ
│   │   └── types/                 # 共通型定義
│   ├── migrations/
│   │   └── 001_init.sql
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                       # gitignore
├── web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   ├── VerifyEmailPage.tsx
│   │   │   ├── ChangePasswordPage.tsx
│   │   │   └── AdminUsersPage.tsx
│   │   ├── api/
│   │   │   └── client.ts          # fetch ラッパー
│   │   └── auth/
│   │       └── AuthContext.tsx
│   ├── package.json
│   └── vite.config.ts
└── ...
```

Phase 1 の `/web/index.html` 単一ファイルから、コンポーネントへの分解は別途段階的に進める(まずログイン画面と認証だけReact化、既存機能は後追いでも可)。

## ロール設計

3階層。JWT ペイロードの `role` クレームで識別。

| ロール | 想定ユーザー |
|---|---|
| `sysadmin` | システム管理者(理事長、IT担当など) |
| `editor` | 編集者(委員長、副委員長、行事担当) |
| `viewer` | 一般メンバー |

### 権限マトリクス

| 操作 | sysadmin | editor | viewer |
|---|:---:|:---:|:---:|
| 委員会・役職マスター編集 | ✓ | | |
| 新規ユーザー登録(管理者経由・仮パスワード発行) | ✓ | | |
| ユーザー一覧・削除・ロール変更 | ✓ | | |
| イベント作成 | ✓ | ✓ | ✓ |
| イベント編集・削除 | ✓ | ✓ | |
| イベントに参加者・受付担当を追加 | ✓ | ✓ | △ 自作のみ |
| QRスキャン(受付モード) | ✓ | △ | △ |
| 出欠ステータスの手動変更 | ✓ | △ | |
| 自分の出欠回答 | ✓ | ✓ | ✓ |
| 自分のQR表示 | ✓ | ✓ | ✓ |
| 自分のパスワード変更 | ✓ | ✓ | ✓ |

**注**:
- イベント作成は viewer も可。ただし viewer が操作できる作成系 API は自作イベント (`created_by` 一致) に限定。編集・削除は editor 以上。
- 「受付モード」はイベント単位の機能(誰が受付担当か)で、ロールとは別。
- 受付 (QRスキャン / 受付済トグル) の可否: sysadmin は常に可。**editor は受付担当に指定されている時 or 管理者モードの時のみ可**。viewer は受付担当に指定されていれば可。
  - UI 側で制御。API は editor を信頼ロールとして許可 (viewMode はサーバーに送られないため)、viewer は受付担当登録を要求。
  - 出欠ステータスの手動変更 API (`PATCH .../attendees/:id`) は editor 以上を要求するため、viewer-受付担当は QRスキャンによるチェックインのみ可 (手動トグルは不可)。

### 一般登録経由のデフォルトロール

一般登録(認証URL方式)で登録されたユーザーのロールは `viewer` 固定。後から sysadmin が必要に応じて昇格させる。

## データベーススキーマ (PostgreSQL)

```sql
-- migrations/001_init.sql

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_normalized TEXT GENERATED ALWAYS AS (lower(email)) STORED,
  name TEXT NOT NULL,
  password_hash TEXT,                                   -- 未設定時 NULL
  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('sysadmin', 'editor', 'viewer')),
  department TEXT,                                       -- 委員会(NULL可)
  title TEXT,                                            -- 役職(NULL可)
  email_verified_at TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email_normalized ON users(email_normalized);

CREATE TABLE email_verifications (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_verifications_user ON email_verifications(user_id);

-- 将来用(パスワード忘れリセット)
CREATE TABLE password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ブルートフォース対策
CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT,
  success BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email_time
  ON login_attempts(email, attempted_at DESC);
```

### SQLite で開始する場合

MVP 期間に SQLite を使う場合、以下を読み替える。`pg` → `better-sqlite3`、`TIMESTAMPTZ` → `TEXT`(ISO8601文字列を格納)、`BOOLEAN` → `INTEGER` (0/1)、`GENERATED ALWAYS AS` は使えないので `email` を保存時に小文字化、`BIGSERIAL` → `INTEGER PRIMARY KEY AUTOINCREMENT`。

スキーマ的にはほぼ同じだが、PostgreSQL 移行を意識して **NOW() ではなく `new Date().toISOString()` をアプリ側で生成する**書き方にしておくと移行が楽。

## 環境変数 (.env.example)

```bash
# サーバー
PORT=3000
NODE_ENV=production
APP_URL=https://attendance.nagareyama-jc.com

# DB (PostgreSQL想定)
DATABASE_URL=postgres://user:pass@localhost:5432/attendance
# (SQLite 開始時) DATABASE_URL=file:./data/app.db

# JWT
JWT_SECRET=長いランダム文字列   # openssl rand -hex 64
JWT_EXPIRES_IN=7d

# Amazon SES
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
MAIL_FROM=no-reply@nagareyama-jc.com
MAIL_FROM_NAME=流山JC 出欠管理
MAIL_DRIVER=ses                # 開発時は console
```

## API エンドポイント設計

### 認証関連 (`/api/auth`)

| Method | Path | 認証 | 説明 |
|---|---|---|---|
| POST | `/api/auth/register` | 不要 | 新規登録 (認証メール送信) |
| GET | `/api/auth/verify-email?token=xxx` | 不要 | メール認証完了 → web側 `/verify-email?status=ok` へリダイレクト |
| POST | `/api/auth/login` | 不要 | ログイン |
| POST | `/api/auth/logout` | 要 | ログアウト (Cookie削除) |
| GET | `/api/auth/me` | 要 | 現在のユーザー情報 |
| POST | `/api/auth/change-password` | 要 | パスワード変更 |

### 管理者用 (`/api/admin`)

| Method | Path | 認証 | 説明 |
|---|---|---|---|
| POST | `/api/admin/users` | sysadmin | ユーザー作成 (仮パスワード発行・メール送信) |
| GET | `/api/admin/users` | sysadmin | ユーザー一覧 |
| PATCH | `/api/admin/users/:id` | sysadmin | ユーザー情報更新 (ロール変更含む) |
| DELETE | `/api/admin/users/:id` | sysadmin | ユーザー削除 |

イベント関連 API (`/api/events/*`) は本ドキュメントの範囲外。PRODUCTION.md 参照。

## 認証フロー詳細

### A. 一般ユーザー新規登録フロー

```
[ユーザー] /register でメール + 名前 + パスワード入力
   │
   ▼ POST /api/auth/register
[API]
   ├─ zod でリクエストバリデーション
   ├─ メールアドレス重複チェック (列挙対策: 既存でも同じ応答を返す)
   ├─ パスワードを bcrypt でハッシュ化
   ├─ users へ INSERT (role='viewer', email_verified_at=NULL)
   ├─ email_verifications へ 24h有効のトークン INSERT
   └─ 認証URL をSES経由で送信
   │   URL例: https://event.../api/auth/verify-email?token=<64文字>
   │
   ▼ (メール受信)
[ユーザー] メール内リンクをクリック
   │
   ▼ GET /api/auth/verify-email?token=xxx
[API]
   ├─ トークン検証 (存在・未使用・期限内)
   ├─ users.email_verified_at を NOW() に更新
   ├─ email_verifications.used_at を更新
   └─ 302 リダイレクト → /verify-email?status=ok (またはerror)
   │
   ▼
[ユーザー] /login からログイン可能
```

### B. sysadmin によるユーザー登録フロー

```
[sysadmin] /admin/users で メール + 名前 + ロール + 委員会/役職 を入力
   │
   ▼ POST /api/admin/users  (要 sysadmin 認証)
[API]
   ├─ 仮パスワードを生成 (12文字)
   ├─ users へ INSERT
   │     - password_hash: 仮パスワードを bcrypt
   │     - email_verified_at: NOW() (管理者経由なので認証スキップ)
   │     - must_change_password: TRUE
   │     - role: 指定された値
   └─ 仮パスワードを記載したメールをSES経由で送信
   │
   ▼ (メール受信)
[ユーザー] 仮パスワードで /login からログイン
   │
   ▼ POST /api/auth/login
[API]
   ├─ パスワード検証成功
   ├─ JWT 発行 (must_change_password=true をペイロードに含める)
   └─ Set-Cookie で auth_token を返す
   │
   ▼ フロントエンド
[ユーザー] AuthContext が must_change_password を検知
            → /change-password に強制リダイレクト
   │
   ▼ POST /api/auth/change-password
[API]
   ├─ 新パスワードをハッシュ化して保存
   ├─ must_change_password = FALSE に更新
   └─ 新しいJWTを再発行
   │
   ▼
[ユーザー] 通常のアプリ画面へ
```

## 重要な実装スニペット

### 1. ロール定義 (`api/src/auth/permissions.ts`)

```typescript
export const ROLES = ['sysadmin', 'editor', 'viewer'] as const;
export type Role = typeof ROLES[number];

// ロールの優先順位 (高いほど強い権限)
const ROLE_LEVEL: Record<Role, number> = {
  sysadmin: 3,
  editor: 2,
  viewer: 1,
};

export function hasMinimumRole(actual: Role, required: Role): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}
```

### 2. 仮パスワード生成 (`api/src/auth/tokens.ts`)

```typescript
import crypto from 'node:crypto';

export function generateTempPassword(): string {
  // 紛らわしい文字 (O,0,I,l,1) を除外
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let pw = '';
  for (let i = 0; i < 12; i++) {
    pw += chars[bytes[i] % chars.length];
  }
  return pw;
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');  // 64文字 hex
}
```

### 3. JWT (`api/src/auth/jwt.ts`)

```typescript
import jwt from 'jsonwebtoken';
import type { Role } from './permissions.js';

export interface JwtPayload {
  sub: string;            // user id
  email: string;
  role: Role;
  must_change_password: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
}

export const COOKIE_NAME = 'auth_token';
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7日
  path: '/',
};
```

### 4. 認証ミドルウェア (Fastify, `api/src/middleware/requireRole.ts`)

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, COOKIE_NAME, type JwtPayload } from '../auth/jwt.js';
import { hasMinimumRole, type Role } from '../auth/permissions.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return reply.code(401).send({ error: 'Unauthorized' });
  try {
    req.user = verifyToken(token);
  } catch {
    return reply.code(401).send({ error: 'Invalid token' });
  }
}

export function requireRole(minimum: Role) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(req, reply);
    if (reply.sent) return;
    if (!hasMinimumRole(req.user!.role, minimum)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
```

使用例: `fastify.post('/api/admin/users', { preHandler: requireRole('sysadmin') }, handler)`

### 5. Amazon SES 送信 (`api/src/mail/ses.ts`)

```typescript
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const ses = new SESv2Client({ region: process.env.AWS_REGION });

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(opts: MailOptions): Promise<void> {
  if (process.env.MAIL_DRIVER === 'console') {
    console.log('───── MAIL ─────');
    console.log('TO:', opts.to);
    console.log('SUBJECT:', opts.subject);
    console.log(opts.text);
    console.log('────────────────');
    return;
  }

  await ses.send(new SendEmailCommand({
    FromEmailAddress: `${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM}>`,
    Destination: { ToAddresses: [opts.to] },
    Content: {
      Simple: {
        Subject: { Data: opts.subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: opts.text, Charset: 'UTF-8' },
          ...(opts.html && { Html: { Data: opts.html, Charset: 'UTF-8' } }),
        },
      },
    },
  }));
}
```

### 6. メール本文テンプレート (`api/src/mail/templates.ts`)

```typescript
import type { Role } from '../auth/permissions.js';

interface User { name: string; email: string; role: Role; }

export function verificationEmail(user: User, token: string) {
  const url = `${process.env.APP_URL}/api/auth/verify-email?token=${token}`;
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

export function tempPasswordEmail(user: User, tempPassword: string) {
  return {
    subject: '【流山JC 出欠管理】アカウントが作成されました',
    text:
      `${user.name} 様\n\n` +
      `管理者によりアカウントが作成されました。\n\n` +
      `ログインURL: ${process.env.APP_URL}/login\n` +
      `メールアドレス: ${user.email}\n` +
      `仮パスワード: ${tempPassword}\n\n` +
      `初回ログイン後、パスワードの変更をお願いします。`,
  };
}
```

### 7. ログインエンドポイント (主要ロジック抜粋)

```typescript
import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from '../db.js';
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from '../auth/jwt.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: '入力不足' });
    const { email, password } = parsed.data;
    const normalized = email.toLowerCase();

    // レート制限: 直近15分で5回以上失敗
    const fifteenMinAgo = new Date(Date.now() - 15 * 60_000);
    const { rows: failRows } = await db.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM login_attempts
       WHERE email = $1 AND success = FALSE AND attempted_at > $2`,
      [normalized, fifteenMinAgo],
    );
    if (Number(failRows[0].cnt) >= 5) {
      return reply.code(429).send({
        error: '試行回数超過。15分後に再試行してください',
      });
    }

    const { rows } = await db.query(
      `SELECT * FROM users WHERE email_normalized = $1`,
      [normalized],
    );
    const user = rows[0];
    const valid = user?.password_hash &&
                  await bcrypt.compare(password, user.password_hash);

    await db.query(
      `INSERT INTO login_attempts (email, ip, success)
       VALUES ($1, $2, $3)`,
      [normalized, req.ip, !!valid],
    );

    if (!valid) {
      return reply.code(401).send({
        error: 'メールアドレスまたはパスワードが違います',
      });
    }
    if (!user.email_verified_at) {
      return reply.code(403).send({ error: 'メール認証が未完了です' });
    }

    const token = signToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
    });
    reply.setCookie(COOKIE_NAME, token, COOKIE_OPTIONS);
    return {
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        must_change_password: user.must_change_password,
      },
    };
  });

  // register, verify-email, logout, me, change-password も同様に実装
}
```

## フロントエンド設計 (React + TS + Vite)

### Vite の dev プロキシ設定 (`web/vite.config.ts`)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

### AuthContext (`web/src/auth/AuthContext.tsx`)

ログイン状態を React Context で管理し、`useAuth()` フック経由で参照。
`must_change_password=true` の場合は `<Navigate to="/change-password" />` で強制リダイレクト。

```typescript
interface AuthUser {
  id: string; email: string; name: string;
  role: 'sysadmin' | 'editor' | 'viewer';
  must_change_password: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}
```

初回マウント時に `GET /api/auth/me` でセッション復元。401 なら未ログイン扱い。

### API クライアント (`web/src/api/client.ts`)

```typescript
export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}
```

### ルーティングと保護されたルート

```typescript
// App.tsx (擬似コード)
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/register" element={<RegisterPage />} />
  <Route path="/verify-email" element={<VerifyEmailPage />} />
  <Route element={<RequireAuth />}>
    <Route path="/change-password" element={<ChangePasswordPage />} />
    <Route element={<RequirePasswordChanged />}>
      <Route path="/" element={<App />} />
      <Route element={<RequireRole minimum="sysadmin" />}>
        <Route path="/admin/users" element={<AdminUsersPage />} />
      </Route>
    </Route>
  </Route>
</Routes>
```

### iOS Safari auto-zoom 対策

ログイン/登録/パスワード変更フォームの input は **font-size: 16px 以上**(CLAUDE.md規約)。

## セキュリティチェックリスト

- [x] パスワードは bcrypt(cost 12)でハッシュ化、平文保存禁止
- [x] JWT は HTTPOnly Cookie のみ(localStorage 禁止)
- [x] Cookie は `Secure` + `SameSite=Lax`(本番)
- [x] ログイン失敗時の応答は「メールアドレスまたはパスワードが違います」固定(列挙対策)
- [x] レート制限: 同一メールアドレスで15分5回失敗まで
- [x] メール認証トークン: 24時間有効、使用後は `used_at` 記録
- [x] トークンは `crypto.randomBytes(32)` で生成(推測困難)
- [x] 既存メールへの再登録試行は同じ応答を返し、列挙を許さない
- [x] HTTPS必須(Caddy の自動HTTPS)
- [x] zod でリクエストバリデーション、型安全
- [x] sysadmin 操作は `requireRole('sysadmin')` で保護
- [ ] 本番デプロイ前に `JWT_SECRET` を `openssl rand -hex 64` で再生成
- [ ] CSRF 対策: SameSite=Lax で大半をカバー。重要操作には追加トークン検討

## Amazon SES セットアップ手順

### 1. ドメイン認証

AWSコンソール → Amazon SES → Verified identities → Create identity

- Identity type: **Domain**
- Domain: `nagareyama-jc.com`
- DKIM: **Easy DKIM** を有効化

表示されるCNAMEレコード3つをDNSに追加。数分〜数十分で `Verified`。

### 2. サンドボックス解除申請

デフォルトはサンドボックスモードで、認証済みアドレス宛にしか送信不可。

AWSコンソール → SES → Account dashboard → Request production access

- Mail type: **Transactional**
- Website URL: `https://attendance.nagareyama-jc.com`
- Use case description: メンバー向け出欠管理システムのメール認証通知
- Expected volume: 月数百通

通常1営業日以内に承認。

### 3. IAM ユーザー作成

SES送信専用ユーザーを作成し、最小権限ポリシーを付与:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ses:SendEmail", "ses:SendRawEmail"],
    "Resource": "*"
  }]
}
```

アクセスキーを発行し `.env` の `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` に設定。

### 4. SPF / DMARC(推奨)

```
TXT  @                "v=spf1 include:amazonses.com ~all"
TXT  _dmarc           "v=DMARC1; p=none; rua=mailto:dmarc@nagareyama-jc.com"
```

### 5. コスト

- 1,000通あたり $0.10(約15円)
- 月1万通でも月150円程度

## 必要な npm パッケージ

### `/api`

```bash
cd api
npm init -y
npm install fastify @fastify/cookie pg bcrypt jsonwebtoken \
  @aws-sdk/client-sesv2 dotenv zod
npm install -D typescript tsx @types/node @types/bcrypt \
  @types/jsonwebtoken @types/pg
```

SQLite で開始する場合は `pg` の代わりに `better-sqlite3` と `@types/better-sqlite3`。

### `/web`

```bash
cd web
npm create vite@latest . -- --template react-ts
npm install react-router-dom
```

## 実装ステップの推奨順序

Claude Code で進める場合、以下の順序が手戻りが少ない。

1. `/api` セットアップ: `package.json`, `tsconfig.json`, `.env.example`, `.gitignore`
2. `api/migrations/001_init.sql` でDB初期化(`api/src/db.ts` でアプリ起動時に読み込み)
3. `api/src/auth/*` 実装(permissions, jwt, password, tokens)
4. `api/src/mail/*` 実装(`MAIL_DRIVER=console` モード優先)
5. `api/src/middleware/*` 実装
6. `api/src/routes/auth.ts` 実装と単体動作確認(curl)
7. `api/src/routes/admin.ts` 実装
8. `api/src/server.ts` で全体統合、Fastify 起動
9. `/web` を Vite + React で初期化、Vite プロキシ設定
10. `web/src/api/client.ts`, `web/src/auth/AuthContext.tsx` 実装
11. `LoginPage`, `RegisterPage`, `VerifyEmailPage`, `ChangePasswordPage` 実装
12. `AdminUsersPage`(sysadmin専用、ユーザー登録UI)
13. ローカル統合テスト(`MAIL_DRIVER=console` でメール内容を確認)
14. Lightsail デプロイ、Amazon SES設定、本番でメール認証テスト

## ローカル開発時の確認方法

開発中は `MAIL_DRIVER=console` で実送信せずコンソール出力する。認証URLが標準出力に出るので、ブラウザにコピペして動作確認。

```bash
# api 側
cd api && npm run dev   # tsx watch

# web 側 (別ターミナル)
cd web && npm run dev

# ブラウザで http://localhost:5173 を開く
# 登録すると api 側のターミナルに認証URLが出力される
```

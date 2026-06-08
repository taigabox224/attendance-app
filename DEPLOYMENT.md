# デプロイ指示書 (インフラ担当者向け)

`attendance-app` を本番環境にデプロイする際の手順書。アプリ層は実装済み・動作確認済みなので、インフラ側で読んで進められる粒度でまとめています。

不明点は村岡 (eishin-muraoka@dimage.co.jp) まで。

---

## 1. アプリ概要

モノレポ構成。2 つのプロセスをデプロイする想定。

| ディレクトリ | 役割 | 種類 |
|---|---|---|
| `/web` | React + Vite フロントエンド | 静的ファイル (ビルド後 `web/dist/`) |
| `/api` | Fastify バックエンド | Node.js プロセス (常駐) |
| `/web/legacy` | Phase 1 プロトタイプ | デプロイ不要 (リポジトリの記録用) |

リクエストの流れ:
```
ブラウザ → 静的 web/dist (HTML/JS/CSS)
       → /api/* は Node プロセスへリバースプロキシ
```

---

## 2. 動作要件

### サーバ側
- **Node.js >= 20** (LTS 推奨)
- **ネイティブビルドツール** (`better-sqlite3` のため): `python3`, `make`, `gcc/g++`
  - Lightsail Ubuntu の場合: `sudo apt install -y build-essential python3`
- **永続ボリューム**: SQLite DB ファイル (`api/data/app.db`) を置く場所。最初は数 MB だが将来増えるので最低 1GB 確保
- **HTTPS 必須**: カメラ API (QR スキャン) が HTTPS でしか動かないため

### 任意
- **MariaDB / PostgreSQL** (将来の移行候補。MVP は SQLite で運用)
- **PM2 / systemd** などのプロセス管理ツール
- **nginx / CloudFront** などのリバースプロキシ

---

## 3. リポジトリ取得

```bash
git clone https://github.com/ds-eishin-muraoka/attendance-app.git
cd attendance-app
```

---

## 4. バックエンド (api) のセットアップ

### 4-1. 依存解決とビルド

```bash
cd api
npm ci
npm run build      # tsc で dist/ に出力
```

### 4-2. 環境変数 (`api/.env`)

`api/.env.example` をコピーして埋める。

```bash
cp .env.example .env
```

| 変数 | 必須 | 説明 |
|---|---|---|
| `PORT` | ○ | API ポート。例: `3000` |
| `NODE_ENV` | ○ | `production` |
| `APP_URL` | ○ | フロントの公開 URL (メール内のリンクに埋め込む)。例: `https://attend.example-jc.com` |
| `DATABASE_URL` | ○ | SQLite なら `file:./data/app.db` (相対パス、cwd 起点) |
| `CORS_ORIGINS` | ○ | 同一オリジン配信なら空欄でも可。別オリジンならカンマ区切り |
| `JWT_SECRET` | ○ | **本番投入前に必ず再生成**。`openssl rand -hex 64` で 128 文字の hex 文字列を生成 |
| `JWT_EXPIRES_IN` | ○ | `7d` 等 |
| `MAIL_DRIVER` | ○ | 本番は `ses`、開発時は `console` |
| `MAIL_FROM` | ○ | 送信元メアド。SES で認証済みのドメインのアドレス |
| `MAIL_FROM_NAME` | ○ | 送信元表示名。例: `流山JC 出欠管理` |
| `AWS_REGION` | SES 利用時 | `ap-northeast-1` |
| `AWS_ACCESS_KEY_ID` | SES 利用時 | IAM ユーザーまたはロール経由 |
| `AWS_SECRET_ACCESS_KEY` | SES 利用時 | 同上 |
| `SEED_*` | 初期投入時のみ | デフォルトユーザー作成用(後述、初回起動後は空でも可) |

### 4-3. データベースとマイグレーション

**SQLite を採用** (MVP 期間)。`better-sqlite3` 経由でローカルファイルを直接読む。

- マイグレーションは **API プロセス起動時に自動実行** される (`api/migrations/*.sql` を順番に流す)
- 適用済みは `schema_migrations` テーブルで管理 (二重実行されない)
- 手動操作は不要

DB ファイルの位置:
- デフォルト: `api/data/app.db` (相対パス)
- カスタマイズ: `.env` の `DATABASE_URL=file:/var/lib/attendance-app/app.db` 等
- **永続ボリュームに置くこと** (コンテナや一時ディスクに置くと再起動で消える)

将来 MariaDB / PostgreSQL に移行する場合は、`api/src/db.ts` を ORM 化する想定 (現状は SQL 直書き)。アプリ要件では SQL 標準機能しか使ってない。

### 4-4. 初期データ投入

DB を一から作る場合、最低限以下を実行:

```bash
# 1. デフォルトの sysadmin アカウント (3 名) を作成
#    .env の SEED_SYSADMIN_* / SEED_MURAOKA_* / SEED_ADACHI_* を埋めてから実行
npm run seed:defaults
```

任意:

```bash
# 開発・検証用のダミーユーザー (editor 3 + viewer 12)
PASSWORD=安全なパスワード npm run seed:users

# 検証用のサンプルイベント (本番では不要)
FORCE=true npm run seed:events
```

すべて idempotent(既存メールはスキップ)なので二重実行 OK。

### 4-5. 起動

```bash
# 開発
npm run dev      # tsx watch で自動再起動

# 本番
node dist/server.js
```

PM2 例:
```bash
pm2 start dist/server.js --name attendance-api --node-args="--enable-source-maps"
pm2 save
pm2 startup    # OS 起動時に自動立ち上げ
```

systemd 例: 別途 unit ファイル作成。`User=`, `WorkingDirectory=api ディレクトリ`, `EnvironmentFile=api/.env`, `ExecStart=/usr/bin/node /path/to/api/dist/server.js`。

### 4-6. ヘルスチェック

シンプルな `GET /api/auth/me` を 401 で叩く方法でアプリ生存を確認可能。専用エンドポイントが必要なら追加します(言ってください)。

---

## 5. フロントエンド (web) のセットアップ

### 5-1. ビルド

```bash
cd web
npm ci
npm run build    # dist/ に出力
```

生成物: `web/dist/index.html` + `web/dist/assets/*` + `web/dist/jc-logo.jpg`

### 5-2. 配信

`web/dist/` をそのまま静的配信。

- nginx で `try_files $uri $uri/ /index.html;` のような SPA fallback を設定
- CloudFront + S3 ならエラーレスポンス 404 → /index.html 200 のリダイレクト設定
- `/api/*` を Node プロセスへリバースプロキシ

### 5-3. API のエンドポイント設定

フロントのコードは `fetch('/api/...')` で相対パスを使う(`web/src/api/client.ts`)。**同一オリジン配信** にすると CORS 設定が不要で楽。

別オリジン配信にする場合:
- フロントの fetch base を `https://api.example.com` に変更 → `client.ts` を修正、または env で出し分け(言ってください、対応します)
- API の `CORS_ORIGINS=https://app.example.com` を設定
- JWT は Cookie (HttpOnly + SameSite=Lax + Secure) で発行されるので、cross-site cookie のため SameSite=None 化が必要(さらに修正必要、相談ください)

---

## 6. nginx 設定例 (同一オリジン)

```nginx
server {
    listen 443 ssl http2;
    server_name attend.example-jc.com;

    ssl_certificate     /etc/letsencrypt/live/attend.example-jc.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/attend.example-jc.com/privkey.pem;

    # API → Node プロセス
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # フロント → 静的ファイル
    root /var/www/attendance-app/web/dist;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 7. デプロイの更新フロー

通常運用:

```bash
cd /var/www/attendance-app
git pull
(cd api && npm ci && npm run build && pm2 restart attendance-api)
(cd web && npm ci && npm run build)
```

DB マイグレーションは API プロセスが起動時に自動実行するため、手動操作不要。

CI/CD で自動化する場合 (GitHub Actions など):
- main push をトリガー
- SSH or AWS SSM で上記コマンドを実行
- 失敗時は前バージョンに戻せるように `dist/` を保存しておくと楽

---

## 8. SES (メール送信) のセットアップ

仮パスワード通知メール・メール認証リンクで使用。

1. SES コンソールで送信ドメインの DKIM 認証 (DNS TXT レコード追加)
2. サンドボックス解除申請 (本番送信用)
3. IAM ユーザーまたはロールに `ses:SendEmail` 権限付与
4. `api/.env` の `MAIL_DRIVER=ses` + `AWS_*` を設定

詳細は別途 [AUTH_FEATURE.md](./AUTH_FEATURE.md) と [INFRA_REQUEST.md](./INFRA_REQUEST.md) を参照。

---

## 9. バックアップ

最低限:
- `api/data/app.db` ファイルを日次でスナップショット (例: AWS Backup / cron + S3 アップロード)
- `.env` 自体は git 管理外なので別途バックアップ

SQLite は単一ファイルなので `cp` でホットコピー可能だが、安全にやるなら `sqlite3 app.db ".backup '/backup/app.db'"` を使う。

---

## 10. トラブルシューティング

| 症状 | 確認 |
|---|---|
| API 起動時に "Cannot find module 'better-sqlite3'" | `npm ci` を api ディレクトリで実行したか / `npm install --build-from-source` で再ビルド |
| マイグレーションが流れない | `api/migrations/*.sql` が dist 配下に含まれているか確認 (`tsconfig.json` の `outDir`)、`api/migrations/` を実行時に参照しているので相対パスに注意 |
| 認証メールが届かない | `.env` の `MAIL_DRIVER` を `console` に切替えてサーバログで内容を確認 |
| QR スキャナが起動しない | HTTPS 経由でアクセスしているか確認 (camera API は HTTPS 必須) |
| カレンダー picker がすぐ閉じる | Chrome DevTools のモバイルエミュレーションでのみ発生する既知 Bug。実機 Safari/Chrome は問題なし |

---

## 11. 追加で開発側に依頼してほしいこと

以下、本番化のために対応が必要な場合は連絡ください:

- **画像の差し替え**: `web/public/jc-logo.jpg` は JC サイトから借りた仮ロゴ。正式ロゴ確定後に差し替え
- **DB の MariaDB 移行**: アプリ要件としては SQL 標準機能のみ使用、ORM 化すれば移行可能。要相談
- **ステージング環境**: 用意してもらえれば、本番投入前の検証フロー追加
- **CI/CD**: GitHub Actions 例の用意も可能

---

## 12. 主要参照ドキュメント

| ファイル | 内容 |
|---|---|
| [INFRA_REQUEST.md](./INFRA_REQUEST.md) | 高レベルなインフラ要件 (依頼書) |
| [PRODUCTION.md](./PRODUCTION.md) | 本番化に向けた準備メモ・データスキーマ |
| [AUTH_FEATURE.md](./AUTH_FEATURE.md) | 認証フローの仕様 |
| [CLAUDE.md](./CLAUDE.md) | アプリの現状とコーディング規約 |

---

## 13. 連絡先

- アプリ開発: **村岡** (`eishin-muraoka@dimage.co.jp`)
- Issue / 質問は [リポジトリ](https://github.com/ds-eishin-muraoka/attendance-app) の Issue または上記メールで

# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業するときに参照するプロジェクトコンテキストです。

## プロジェクト概要

出欠記録Webアプリ。管理者がイベントを作成して参加者を招待し、ユーザーは出欠を回答、出席時はQRコードを生成して当日受付で提示する。受付では管理者がQRをスキャンして参加者をチェックインする。スマホ利用が前提。

組織は **流山青年会議所 (JC)**。デザインは [jc-na.main.jp](https://jc-na.main.jp/) のトーンに寄せている。

## 現状とフェーズ

### Phase 1: プロトタイプ (`web/legacy/index.html`)
- 単一HTMLファイルで全部入り、データは localStorage + jsonbin.io 同期
- Phase 2 開発時のリファレンス実装として保持。新規開発はしない
- Legacy の仕様確認時はこのファイルを直接読む

### Phase 2: 本実装 (現在のメイン開発、リポジトリ全体)
- **フロント**: React + TypeScript + Vite (`/web/src`)
- **バックエンド**: Fastify + TypeScript + better-sqlite3 (`/api`)
- **DB**: SQLite (本番では MariaDB / PostgreSQL 移行も検討)
- **認証**: 自作 JWT + bcrypt + Cookie + Amazon SES メール認証
- **ホスティング想定**: AWS Lightsail (詳細 [INFRA_REQUEST.md](./INFRA_REQUEST.md))

詳細仕様:
- 認証フロー: [AUTH_FEATURE.md](./AUTH_FEATURE.md)
- 本番化準備: [PRODUCTION.md](./PRODUCTION.md)
- インフラ依頼: [INFRA_REQUEST.md](./INFRA_REQUEST.md)
- デプロイ手順: [DEPLOYMENT.md](./DEPLOYMENT.md)

## 技術スタック

### Frontend (`/web`)
- **React 18** + **TypeScript** + **Vite 5**
- **react-router-dom v6** で SPA ルーティング
- **html5-qrcode** (QRスキャン、lazy load)
- **qrcode.react** (QR表示、SVG)
- **Google Fonts**: Noto Sans JP + (システム YuMincho を優先しつつ Shippori Mincho フォールバック)
- 状態管理は React Context (`AuthContext`)、外部ストアは入れていない
- CSS は `src/index.css` 単体に集約 (BEM 等は使わずフラットなクラス命名)

### Backend (`/api`)
- **Fastify 4** + **TypeScript** (ESM `type: module`)
- **better-sqlite3** で SQLite 直叩き (ORM なし、SQL 直書き)
- **zod** で入力 schema バリデーション
- **bcrypt** でパスワードハッシュ
- **jsonwebtoken** で JWT
- **@aws-sdk/client-sesv2** で SES 送信 (`MAIL_DRIVER=ses` のとき)
- マイグレーションは `api/migrations/*.sql` を順番に流す自前実装 (`api/src/db.ts`)、`schema_migrations` で適用済み管理

## ファイル構成

```
.
├── web/
│   ├── public/
│   │   └── jc-logo.jpg            # 仮ロゴ (JC サイトから借用)、正式版で差し替え予定
│   ├── src/
│   │   ├── api/client.ts          # fetch ラッパ (Cookie credentials: include)
│   │   ├── auth/AuthContext.tsx   # ログイン状態 + viewMode (user/admin)
│   │   ├── components/            # 共通 UI (Topbar, DateInput, QrScannerModal, ...)
│   │   ├── pages/                 # 画面コンポーネント
│   │   ├── lib/breakdown.ts       # 出席内訳の集計
│   │   ├── lib/format.ts          # 日付/曜日フォーマット
│   │   ├── routes/                # RequireAuth / RequireRole / RequirePasswordChanged
│   │   ├── index.css              # 全体 CSS
│   │   └── App.tsx                # ルート + ルーティング
│   ├── legacy/                    # Phase 1 プロトタイプ (参照用)
│   └── index.html
├── api/
│   ├── migrations/                # *.sql、起動時に自動適用
│   ├── scripts/                   # seed-defaults / seed-users / seed-events / seed-sysadmin
│   ├── src/
│   │   ├── routes/                # auth / admin / events / users / masters / attendee-lists
│   │   ├── auth/                  # jwt.ts / password.ts / permissions.ts / tokens.ts
│   │   ├── middleware/            # requireAuth / requireRole / rateLimit
│   │   ├── mail/                  # console.ts / ses.ts / templates.ts
│   │   ├── db.ts                  # better-sqlite3 wrapper + runMigrations
│   │   └── server.ts              # Fastify エントリポイント
│   ├── .env.example
│   └── package.json
├── README.md
├── CLAUDE.md                      # このファイル
├── PRODUCTION.md                  # 本番化準備メモ
├── AUTH_FEATURE.md                # 認証機能仕様
├── INFRA_REQUEST.md               # インフラ構築依頼書
└── DEPLOYMENT.md                  # デプロイ手順 (インフラ担当者向け)
```

## 開発フロー

### ローカル起動

```bash
# API (port 3000)
cd api && npm install && npm run dev

# Web (port 5173, /api/* は API へプロキシ済み)
cd web && npm install && npm run dev
```

ブラウザで `http://localhost:5173` 。

### 初回 DB セットアップ

```bash
cd api
# .env を整える (.env.example をコピーして SEED_* を埋める)
npm run seed:defaults        # 3 sysadmin (システム管理者 + 村岡 + 足立)
npm run seed:users           # editor 3 + viewer 12 のダミー
FORCE=true npm run seed:events   # イベント 6 件 (過去・近日・未来・下書き混在)
```

### 検証コマンド

```bash
# Web
cd web && npm run typecheck && npm run build

# API
cd api && npm run typecheck && npm run build
```

### デプロイ

`main` ブランチに push すると Vercel が自動で再デプロイ (Phase 1 互換、現在 `web/dist` を配信)。本番 Lightsail への移行は別途 [DEPLOYMENT.md](./DEPLOYMENT.md) 参照。

> このプロジェクトでは **コミット&push まで確認なしで自動実行** することが許可されている(`/Users/eishin/.claude/projects/-Users-eishin-git-attendance-app/memory/feedback_push_without_asking.md`)。破壊的操作のみ確認を取る。

## ロール権限モデル

| ロール | 概要 |
|---|---|
| **sysadmin** | システム管理者。全機能 (ユーザー管理、イベント全表示、受付、設定) |
| **editor** | 編集者。/admin/users + イベント編集可。**ただし受付 (QRスキャン + 受付済トグル) は不可**、/events は招待されたイベントのみ表示 |
| **viewer** | 閲覧者。自分の RSVP のみ。受付担当に指定されていれば受付モード可 |

### システムアカウント (`is_system_account=1`)
- 運用専用の sysadmin (`seed:defaults` で `SEED_SYSADMIN_*` 経由作成、名前のみ・姓名分割なし)
- `/api/users` (参加者ピッカー) と `/api/admin/users` (ユーザー管理) から自動的に除外
- PATCH/DELETE も 403 で拒否
- 「人間ではない管理者」用、出欠カウントにも入らない

### viewMode (ユーザー/管理者 切替)
- editor 以上に存在する UI トグル
- **/events でのみ切替可能** (歯車メニュー内、Topbar の色とロールピル文言で現在モードを表示)
- 管理者モード時: 編集機能 + 下書き表示 + admin タブ (イベント / ユーザー) が出る
- ユーザーモード時: 一般ユーザーと同じ見え方

## 主要画面

### ユーザー向け (`/events`, `/events/:id`)
- イベント一覧 (期間フィルタ + ステータスバッジ + 自分の RSVP ステータス)
- イベント詳細 (Hero + RSVP カード「出席する/欠席する」)
- QR表示 (出席回答済みの場合)
- マイメニュー (歯車 → プロフィール編集 / パスワード変更 / ログアウト / モード切替)

### 管理者向け (admin モード時)
- 同じ `/events/:id` 内で 4 カウントグリッド + 出席内訳 + 懇親会会費内訳 + 参加者リスト管理
- 「📷 QRコードをスキャン」CTA → QrScannerModal (会費徴収モーダル付き、legacy openScanFeeModal 相当)
- 出欠/受付/会費トグルに confirm ダイアログ
- `/events/new`, `/events/:id/edit` (EventFormFull、共通フォーム)

### sysadmin / editor 向け (`/admin/users`)
- ユーザー一覧 + 検索/ステータス/委員会/役職 フィルタ
- 複数選択 → 一括変更モーダル (ステータス/委員会/役職)
- 歯車 → 設定モーダル (委員会・役職マスター / 表示順 / 参加者リスト)

## データモデル

主要テーブル (`api/migrations/001_init.sql` 以降):

| テーブル | 主要カラム |
|---|---|
| `users` | id, email, password_hash, name, family_name, given_name, role, department, title, status, display_order, **is_system_account**, must_change_password |
| `events` | id, title, start_at, end_at, response_deadline, committee, location, description, created_by, published, has_afterparty, afterparty_* |
| `event_attendees` | id, event_id, user_id, is_observer, observer_name, status, after_status, checked_in_at, fee_paid |
| `event_receptionists` | event_id, user_id |
| `attendee_lists` | id, name, ... (M:N で `attendee_list_users`) |
| `master_lists` | kind (`department` or `title`), values_json (JSON 配列) |
| `email_verifications`, `password_reset_tokens` | 認証フロー用 |

`schema_migrations` で適用済みマイグレーションを管理。

## コーディング規約 / 設計メモ

### スマホファースト
- `.app-frame` で `max-width: 440px` 中央寄せ
- タップターゲットは最低 40px 確保
- iOS Safari の auto-zoom 対策で input/select/textarea の `font-size: 16px`

### デザインシステム
- **CSS 変数** で色・余白を定義 (`:root`、`web/src/index.css` 冒頭)
- **JC blue (#0090D5)** が primary、**terracotta #C7522A** が accent (受付/会費 警告色)
- 背景は冷たい白基調 (`#f5f7fa` / `#f7f9fc`)、見出しは YuMincho + 明朝
- ロゴは JC サイトの仮バナー (`web/public/jc-logo.jpg`)、正式版が来たら差替
- 詳細なフォント/色は `index.css` の `:root` を直接参照

### UI 規則
- モーダルは `modal-overlay` + `modal` で統一。ハンドル + 閉じるボタン (×) を必ず付ける
- 出欠/受付/会費の手動変更は `window.confirm()` で確認ダイアログ (legacy 仕様)
- 日付の表記は `YYYY.MM.DD(曜) HH:MM` (`lib/format.ts` の `formatDateTime`)
- 「年/月/日」placeholder は実装せず native input に戻している (picker が即閉じる不具合のため)

### バックエンド
- 各 route は `requireAuth` または `requireRole(...)` を必ず付ける
- `zod` で body validation、失敗時 400
- DB 操作は SQL 直書き (better-sqlite3 はトランザクションが速い、`db.transaction()` 多用)
- パスワードは bcrypt (cost 10)
- JWT は HttpOnly + SameSite=Lax + Secure (本番) で Cookie 発行

## 既知の挙動

- Chrome DevTools のモバイルエミュレーションだと `<input type="date">` の picker が即閉じる (実機 Safari/Chrome は問題なし)
- 仮パスワード状態のユーザーは `/change-password` 以外に行けない (`RequirePasswordChanged` でガード)
- `/events/:id/reception` URL は `/events/:id` にリダイレクト (受付モードは詳細画面内の状態に統合済み)
- viewer も受付担当に指定されていれば受付できる (editor は不可)

## 作業ガイドライン

- 既存ファイルの編集を優先、新規ファイル作成は最小限に
- ドキュメント (README/CLAUDE.md 等) は明示的に依頼があった時のみ更新
- 絵文字は明示的な依頼がない限り使わない
- レガシー仕様確認は `web/legacy/index.html` を直接読む
- 動作確認: API は `npm run dev` で起動、Web は同じく `npm run dev` (ポート 3000 + 5173)
- 型チェックは `npm run typecheck`、ビルドは `npm run build` で確認

## よく触る場所

- 画面追加 → `web/src/pages/`
- 共通 UI → `web/src/components/`
- API ルート → `api/src/routes/`
- DB スキーマ変更 → `api/migrations/` に新規 SQL ファイル追加 (次の番号で)
- 色 / フォント変更 → `web/src/index.css` の `:root`

## Phase 2 残タスク

- 本番デプロイ ([DEPLOYMENT.md](./DEPLOYMENT.md) 参照、インフラ担当へ依頼中)
- 正式ロゴ差し替え
- Vercel から AWS Lightsail への移行
- Amazon SES のサンドボックス解除 + DKIM 認証
- 必要に応じて MariaDB / PostgreSQL 移行 (現状 SQLite で十分稼働)

# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業するときに参照するプロジェクトコンテキストです。

## プロジェクト概要

出欠記録Webアプリ。管理者がイベントを作成して参加者を招待し、ユーザーは出欠を回答、出席時はQRコードを生成して当日受付で提示する。受付では管理者がQRをスキャンして参加者をチェックインする。スマホ利用が前提。

現在は **プロトタイプ段階** (単一HTMLファイル + localStorage + jsonbin.io によるクラウド同期)。本実装では認証 + 専用バックエンドに置き換える予定。詳細は [PRODUCTION.md](./PRODUCTION.md) 参照。

## 現状とフェーズ

### Phase 1: プロトタイプ (現在)
- 単一HTMLファイル (`web/index.html`) で完結
- 全ロジックがインラインの `<script>` 内
- データはブラウザの localStorage に保存
- 端末間同期は **jsonbin.io** 経由(Master Key + Bin ID を各端末に保存)
- ホスティングは **Vercel**(静的サイト、`outputDirectory: web`)
- 目的: UI/UX検証、フロー確認、スマホでのQRスキャン動作確認

### Phase 2: 本実装(未着手)
- **ホスティング**: AWS Lightsail(コスト優先) or Amplify Hosting
- **認証**: メールアドレス + メール認証(Cognito + SES を想定)
- **DB**: PostgreSQL(Lightsail 同居 or RDS) or DynamoDB
- **バックエンド**: Node.js + TypeScript(Fastify / Express)。`/api` 配下に構築
- **フロント**: React + TypeScript + Vite を想定。`/web` 配下に構築

本番化の準備事項・スキーマ・移行リスクは [PRODUCTION.md](./PRODUCTION.md) にまとめている。

## 技術スタック (Phase 1)

- **HTML / CSS / vanilla JavaScript** のみ(ビルド無し)
- **外部ライブラリ** (CDNから読み込み):
  - `qrcodejs` (1.0.0) - QRコード生成
  - `html5-qrcode` (2.3.8) - QRコードスキャン (カメラ)
- **フォント**: Google Fonts (Noto Sans JP, Shippori Mincho, JetBrains Mono)
- **クラウド同期**: jsonbin.io v3 API(プロトタイプ専用、本番では削除)

## ファイル構成

```
.
├── web/
│   └── index.html    # プロトタイプ本体 (HTML + CSS + JS 全部入り)
├── api/
│   └── .gitkeep      # Phase 2 でバックエンド (Node.js + TypeScript) を入れる
├── vercel.json       # Vercel に web/ を配信対象として指定 (outputDirectory)
├── README.md
├── CLAUDE.md         # このファイル
├── PRODUCTION.md     # 本番化に向けた準備メモ
└── .gitignore
```

リポジトリは Phase 2 を見越して **モノレポ構成**(`/web` + `/api`)。Phase 1 の現時点では `/api` は空。

## 開発・デプロイ

### ローカルで開く
```bash
cd web && python3 -m http.server 8000
# → http://localhost:8000
```

カメラAPIはHTTPSが必須なため、QRスキャンを試したい場合は Vercel デプロイ後のURLで検証する。

### デプロイ
`main` ブランチに push すると Vercel が自動で再デプロイ。`vercel.json` の `outputDirectory: web` で `/web` 配下を配信。

```bash
git add .
git commit -m "..."
git push
```

> このプロジェクトでは **コミット&push まで確認なしで自動実行** することが許可されている(`/Users/eishin/.claude/projects/-Users-eishin-git-attendance-app/memory/feedback_push_without_asking.md`)。破壊的操作のみ確認を取る。

## 主要な機能

- 3階層の権限: **システム管理者 / 編集者 / 閲覧者**
- ユーザー画面 / 管理者画面のトグル(管理者・編集者向け)
- イベントごとの受付担当指定(通常モード/受付モードを切替)
- 下書き保存と公開、URL 共有(`?event=ID`)
- 委員会・役職マスター編集(sysadmin のみ)
- 参加者リスト(プリセット)からの一括選択
- 出席内訳(委員会別 / 全体 / オブザーバー)+ CSV 出力
- jsonbin.io 経由のクラウド同期 + last-write-wins 競合解決

## データモデル(要約)

詳細は [PRODUCTION.md](./PRODUCTION.md) のスキーマ章を参照。

```javascript
state = {
  updatedAt: ISO8601,
  currentUserId: 'u_xxx',
  currentEventId: 'e_xxx' | null,
  departments: string[],     // 委員会マスター
  titles: string[],          // 役職マスター
  userOrderIds: string[],    // ユーザー表示順
  users: [...],
  events: [...],
  attendeeLists: [...]
}
```

## コーディング規約 / 設計メモ

- **スマホファースト**: `.app-frame` で `max-width: 440px` 中央寄せ。タップターゲットは最低 40px 確保
- **CSS変数** で色・余白を定義(`:root` 内)。`--accent` は terracotta系 `#C7522A`、`--primary` は青系 `#355282`
- **フォント**: 見出しは `Shippori Mincho`(明朝)、本文は `Noto Sans JP`、数字や日付は `JetBrains Mono`
- **DOM操作**: jQuery等は使わず、`getElementById` のショートカット `$()` のみ
- **永続化**: state 変更時は必ず `await saveState()` を呼ぶ。自動同期 ON なら同時にクラウドへ PUT
- **画面遷移**: SPA的に `screen-hidden` クラスの付け外しで切替。`showScreen(name)` 関数を経由
- **iOS Safari の auto-zoom 対策**: フォーム入力の font-size は 16px 以上
- **モーダル**: `openModal(id)` / `closeModal(id)`。`openModal` は `.modal` の scrollTop を 0 にリセット

## 既知の制約(プロトタイプ由来)

これらはすべて Phase 2 で解消予定。

- `state.currentUserId` がクラウド同期に含まれてしまい、別端末で誰かが role 切替すると同期される
- QRトークンに署名がない(`attend:<eventId>:<userId>` 平文)
- 同じQRを複数回スキャンした時は「既に受付済」エラーを返すが、本番ではトークン無効化が必要
- 削除操作の Undo がない
- jsonbin.io の Master Key を端末ローカルに保存している(本番では削除)
- 認証なし。ロール切替は role-pill から自由に変更可能(デモ用)

## 作業ガイドライン

- 既存ファイルの編集を優先(新規ファイル作成は最小限に)
- ドキュメント(README/CLAUDE.md 等)は明示的に依頼があった時のみ更新
- 絵文字は明示的な依頼がない限り使わない
- 必要なときは ` python3 -m http.server` で動作確認、`node --check` でJS構文チェック
- データ変更が伴う場合は **localStorage の状態に古いデータが残っている可能性** を考慮(loadState の後方互換移行で吸収)

## Phase 2 着手時の最初の動き

1. ~~リポジトリを `/web` と `/api` に分割~~(済: モノレポ構成にしてある)
2. `/web` を React + TypeScript + Vite に置換(現状の `index.html` をコンポーネントに分解)
3. TypeScript で `state` shape / Entity 型を起こす(PRODUCTION.md のスキーマを移植)
4. AWS アカウント + Cognito + SES の準備
5. Lightsail に Node.js + PostgreSQL を立て、`/api` に Fastify/Express で実装
6. 認証フローを実装し、フロントの I/O 層を `fetch('/api/...')` に置換
7. 既存 cloud sync データを移行スクリプトで取り込み

詳細は PRODUCTION.md の「本実装フェーズで着手する想定タスク」を参照。

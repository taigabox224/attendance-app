# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業するときに参照するプロジェクトコンテキストです。

## プロジェクト概要

出欠記録Webアプリ。管理者がイベントを作成して参加者を招待し、ユーザーは出欠を回答、出席時はQRコードを生成して当日受付で提示する。受付では管理者がQRをスキャンして参加者をチェックインする。スマホ利用が前提。

現在は **プロトタイプ段階**(単一HTMLファイル、データはブラウザローカル保存)。本実装ではFirebase等のバックエンドに置き換える予定。

## 現状とフェーズ

### Phase 1: プロトタイプ (現在)
- 単一HTMLファイル (`index.html`) で完結
- 全ロジックがインラインの `<script>` 内
- データはブラウザのストレージに保存(複数端末で共有不可)
- 目的: UI/UX検証、フロー確認、スマホでのQRスキャン動作確認

### Phase 2: 本実装 (未着手)
- React (Next.js) + Firebase (Auth + Firestore + Hosting) の構成を予定
- 認証、複数端末同期、リマインド通知、CSV出力などを追加

## 技術スタック (Phase 1)

- **HTML / CSS / vanilla JavaScript** のみ
- **外部ライブラリ** (CDNから読み込み):
  - `qrcodejs` (1.0.0) - QRコード生成
  - `html5-qrcode` (2.3.8) - QRコードスキャン (カメラ)
- **ホスティング**: Vercel (静的サイトとして配信、HTTPS自動付与)
- **フォント**: Google Fonts (Noto Sans JP, Shippori Mincho, JetBrains Mono)

ビルドツール・パッケージマネージャーは現時点では使っていない。Phase 2 で導入。

## ファイル構成

```
.
├── index.html      # 本体 (HTML + CSS + JS 全部入り)
├── README.md
├── CLAUDE.md       # このファイル
└── .gitignore
```

## 開発・デプロイ

### ローカルで開く
ファイルを直接ブラウザで開くだけで動く。ただし `file://` プロトコルではカメラAPIが使えないので、QRスキャンを試したい場合はローカルサーバー経由で開く:

```bash
python3 -m http.server 8000
# → http://localhost:8000 をブラウザで開く
```

### スマホで検証
PCと同じWi-Fiにスマホを接続し、PCのIPアドレス(例 `http://192.168.1.5:8000`)をスマホで開く。ただしカメラAPIはHTTPSが必須なため、本格的な検証はVercelデプロイ後のURLで行う。

### デプロイ
`main` ブランチにpushすると Vercel が自動で再デプロイする。設定は不要(静的サイトとして自動認識)。

```bash
git add .
git commit -m "..."
git push
```

## 既知の問題 / 修正が必要な箇所

### 🔴 重要: ストレージAPIの差し替え
現状のコードは Claude artifact 環境向けの `window.storage` API を使っているため、Vercel上では動かない。`localStorage` ベースに置き換える必要がある。

該当箇所は `loadState()` と `saveState()` 関数。修正方針:

```javascript
async function loadState() {
  try {
    const raw = localStorage.getItem('attendance_app_state');
    if (raw) {
      state = JSON.parse(raw);
      return;
    }
  } catch (e) {}
  state = SEED();
  await saveState();
}
async function saveState() {
  try {
    localStorage.setItem('attendance_app_state', JSON.stringify(state));
  } catch (e) { console.warn('save failed', e); }
}
```

### その他
- QRトークンに署名がない (`attend:<eventId>:<userId>` の生文字列)。Phase 2 でJWTかHMAC署名を付ける
- 同じQRを複数回スキャンした時の挙動は「既に受付済」エラーを返すが、本番では time-based に動作させる方が安全
- 削除操作の取り消し(Undo)がない
- ユーザー追加・削除のUIがない(SEEDデータで固定)

## データモデル

```javascript
state = {
  users: [
    { id: 'u_xxx', name: '...', role: 'admin' | 'user' }
  ],
  events: [
    {
      id: 'e_xxx',
      title: '...',
      date: ISO8601,
      location: '...',
      description: '...',
      createdBy: 'u_xxx',
      attendees: [
        {
          userId: 'u_xxx',
          status: 'pending' | 'yes' | 'no' | 'checked',
          checkedInAt: ISO8601 | null
        }
      ]
    }
  ],
  currentUserId: 'u_xxx',   // デモ用に切り替え可能
  currentEventId: 'e_xxx' | null
}
```

### ステータス遷移
- `pending` (初期) → ユーザーが回答すると `yes` / `no`
- `yes` → 当日受付でQRスキャンされると `checked`
- 管理者は任意のステータスに手動で変更可能(ユーザーがログインできない場合の救済)

## コーディング規約 / 設計メモ

- **スマホファースト**: `.app-frame` で `max-width: 440px` 中央寄せ。タップターゲットは最低 40px 確保
- **CSS変数** で色・余白を定義(`:root` 内)。`--accent` は terracotta系 `#C7522A`
- **フォント**: 見出しは `Shippori Mincho` (明朝)、本文は `Noto Sans JP`、数字や日付は `JetBrains Mono`
- **DOM操作**: jQuery等は使わず、`getElementById` のショートカット `$()` のみ
- **永続化**: state変更時は必ず `await saveState()` を呼ぶ
- **画面遷移**: SPA的に `screen-hidden` クラスの付け外しで切替。`showScreen(name)` 関数を経由

## Phase 2 への移行メモ

本実装に進むときの想定:

- **フレームワーク**: Next.js (App Router) + TypeScript
- **認証**: Firebase Auth (Email + Google OAuth)
- **DB**: Firestore
  - `users` コレクション
  - `events` コレクション (サブコレクションに `attendees`)
- **セキュリティルール**: 管理者は自分が作ったイベントのみ編集可、ユーザーは自分のattendeeレコードのみ更新可
- **QRトークン**: Cloud Functions で短期JWTを発行 → スキャン時にCloud Functionsで検証
- **通知**: FCM (Firebase Cloud Messaging) でイベント前日リマインド
- **PWA化**: manifest.json + Service Worker でホーム画面追加対応

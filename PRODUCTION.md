# 本番化準備メモ

プロトタイプ(`web/index.html` 単一ファイル + localStorage + jsonbin.io)から、本番運用(ログイン認証 + AWSホスティング)へ移行するときの準備事項。

## リポジトリ構成

Phase 2 を見越してモノレポ構成にしてある:

```
/web   ... フロントエンド (Phase 1: index.html 単一ファイル / Phase 2: React + TypeScript + Vite 想定)
/api   ... バックエンド (Phase 1: 空 / Phase 2: Node.js + TypeScript + Fastify/Express)
```

Vercel は `vercel.json` の `outputDirectory: web` で `/web` を配信対象に指定している。Phase 2 で React に置き換えても `/web` のまま(ビルド成果物は `/web/dist`)。

## 想定構成

- **フロント**: Phase 2 で React + TypeScript + Vite に置換予定(`/web` 配下)。現状の `index.html` をコンポーネントに分解しつつ、API 化に伴って I/O 層を fetch ベースに差し替え
- **認証**: メールアドレス + メール認証(マジックリンク or パスワード + verify)
- **バックエンド**: Node.js + TypeScript(Fastify or Express)、`/api` 配下
- **DB**: 未確定。PostgreSQL or DynamoDB
- **ホスティング**: ユーザ希望は AWS Lightsail(コスト重視)

## データスキーマ(現状)

```jsonc
state = {
  updatedAt: ISO8601,            // クラウド同期の競合解決用
  currentUserId: string,         // ※本番では認証セッションから取得(state に持たない)
  currentEventId: string|null,   // ※本番では URL or per-device に切り出す
  userOrder: ?,                  // (旧フィールド、未使用)
  userOrderIds: string[],        // イベント作成のユーザ並び順(共有)
  departments: string[],         // 委員会マスター
  titles: string[],              // 役職マスター
  users: User[],
  events: Event[],
  attendeeLists: AttendeeList[], // 参加者プリセット
}

User = {
  id: string,             // 現状 'u_admin' / 'u_001' 形式。本番では UUID or email
  name: string,           // 表示用(姓 + ' ' + 名)
  lastName: string,
  firstName: string,
  email: string|null,     // ★本番のログインキー候補
  role: 'sysadmin' | 'editor' | 'viewer',
  department: string|null, // 委員会マスターの値か null
  title: string|null,      // 役職マスターの値か null
  status: 'active' | 'inactive' | 'left',
}

Event = {
  id: string,                       // 'e_xxx'
  title: string,
  date: ISO8601,                     // 開始日時(必須)
  endDate: ISO8601|null,             // 終了日時(任意)
  responseDeadline: ISO8601|null,
  committee: string|null,            // 担当委員会 / 'その他' / null
  location: string,
  description: string,
  createdBy: string,                 // userId
  published: boolean,
  hasAfterparty: boolean,
  afterpartyTitle: string|null,
  afterpartyLocation: string|null,
  afterpartyDescription: string|null,
  receptionists: string[],           // userId[]
  attendees: Attendee[],
}

Attendee = {
  userId: string,         // 'obs_xxx' なら observer
  status: 'pending' | 'yes' | 'no',
  afterStatus: 'pending' | 'yes' | 'no' | null,
  checkedInAt: ISO8601|null,
  isObserver?: true,      // ゲスト用
  name?: string,          // observer のみ、自由入力
}

AttendeeList = {
  id: string,
  name: string,
  userIds: string[],
}
```

## 永続化境界(現状の I/O ポイント)

| 関数 | 役割 | 本番置換イメージ |
| --- | --- | --- |
| `loadState()` | localStorage から復元 | `GET /api/state`(認可必要) or 必要なリソース単位の取得 |
| `saveState({skipCloud})` | localStorage + cloudPush | エンドポイント単位の `PUT/POST` に分解 |
| `cloudPush()` / `cloudPull()` | jsonbin.io v3 | 削除。サーバ側の DB が真実 |
| `cloudCreate()` / `cloudJoin()` / `cloudDisconnect()` | jsonbin.io 設定 | 削除 |
| `syncConfig` localStorage | jsonbin の master key/bin id | 削除。Cognito アクセストークン等に置換 |
| `state.attendeeLists.id` 生成 (`'list_' + Date.now()`) | クライアント側採番 | サーバ採番に変更(UUID) |
| `state.events.id` 生成 (`'e_' + Date.now()`) | 同上 | 同上 |
| `Attendee.userId = 'obs_xxx'` | observer の擬似ID | サーバ側スキーマで `isObserver` を素直に持つ |

## per-device 状態 vs 同期する状態

per-device(本番では state に入れない、もしくは別経路):

- `currentUserId`(認証セッションから derive)
- `currentEventId`(URL `?event=` で表現)
- `viewMode`(localStorage 直)
- `receptionMode`(セッションメモリのみ)
- `pendingRsvp`(submit 前のドラフト)
- `inviteSelection` / `receptionistSelection` / `pendingObservers` 等のモーダル内ステート
- `inviteListApplied`(UI ヒント)

同期する(DBに乗る):

- `users` / `events` / `attendeeLists` / `departments` / `titles` / `userOrderIds`

> 現状は `currentUserId` が state に入って同期されてしまうため、複数端末でロール切替するとお互いに影響する。プロトタイプの既知の制約。本番では認証で解決。

## 認証導入時の移行リスク・対応

| 項目 | 現状 | 本番での対応 |
| --- | --- | --- |
| ユーザ識別 | `u_admin` 等の文字列 | Cognito sub(UUID) もしくは email。`User.email` を今のうちに任意で持たせて移行表を作る |
| 権限判定 | フロントの `canEditEvent` 等 | サーバ側の API 認可で真の判定。フロントは UI ガード扱い |
| ロール切替 デモ機能 | 任意のユーザに切り替え可能 | 削除。実認証ベース |
| マスターキーの localStorage 保存 | jsonbin の Master Key を localStorage に置く | 削除。代わりに認証トークンを HttpOnly cookie に |
| イベント編集の楽観ロック | last-write-wins(`updatedAt` 比較) | DB 側でバージョン管理 or 楽観ロック列を導入 |
| 同期競合 | 端末A保存→Bプル→Bに同じが落ちる | API 化で自然に解決 |
| 観察者(observer) | フロントで `obs_*` のフェイクID | サーバ側スキーマで明示。`user_id NULL` + `is_observer` カラム |
| QRトークン | `attend:{eventId}:{userId}` 平文 | JWT 等の署名付きトークンで偽造防止 |
| URL での詳細直リンク | `?event=ID` で誰でも開ける(下書きは非admin/非招待を弾く) | 認証 + 認可で守る |
| CSV 出席内訳 | フロントで計算 | API 側で集計するか、フロントは同じでも OK |
| 委員会・役職マスター変更 | sysadmin だけ可、即同期 | 同じ。マスター変更はサーバ側の整合性チェック必要(委員会削除時の参照) |

## AWS 構成のコスト比較

ユーザ規模を「アクティブ ~200名、月間アクセス数千程度」と仮定。

### 案A: Lightsail 1台で完結(現方針)

| 月額目安 | 構成 |
| --- | --- |
| **$5-10** | Lightsail 2GB プラン 1台で Node.js + SQLite or PostgreSQL を同居 |
| + $1 | Lightsail バックアップ自動取得 |
| 別途 | ドメイン取得・更新($1〜/月) |

メリット: シンプル・最安・固定費。
デメリット: スケール手動・冗長化なし・SES(メール送信)は別途、認証は自作 or Cognito。

### 案B: Amplify Hosting + Lambda + RDS(サーバレス寄せ)

| 月額目安 | 構成 |
| --- | --- |
| **$0-2** | Amplify Hosting(静的)・月数千 PV 程度なら無料枠内 |
| **$3-15** | Lambda + API Gateway(リクエスト数次第。月100万リクエストまで無料枠) |
| **$13-20** | RDS PostgreSQL `db.t4g.micro`(24時間稼働。停止すれば下がる) |
| **$0.50** | SES(月5,000通まで無料) |
| **$0** | Cognito ユーザープール(MAU 5万まで無料) |

メリット: スケール自動・冗長化・認証/メール認証が AWS マネージドで楽。
デメリット: 初期設定の手間が多い・サービス数が増える(請求が複雑)。

### 案C: App Runner + DynamoDB(コンテナ + サーバレス DB)

| 月額目安 | 構成 |
| --- | --- |
| **$5-25** | App Runner(リクエスト数次第) |
| **$1-5** | DynamoDB(オンデマンド) |
| **$0** | Cognito + SES |
| **$0** | Amplify Hosting or S3+CloudFront |

メリット: コンテナで開発がしやすい。スケール自動。
デメリット: DynamoDB はリレーションを書きづらい。委員会マスターの参照整合性は工夫が必要。

### 推奨

ユーザ要件が「コスト重視」かつ規模が小さいなら **案A(Lightsail)** で構わない。
ただし以下を視野に入れて構築すると、後の引っ越しが楽:

- アプリと DB を docker-compose で分離可能にしておく
- 認証は Cognito を呼び出す形にしておく(自前認証より将来移行しやすい)
- メール送信は SES API 直叩き(`smtp.gmail.com` などローカル設定に依存しない)

## 「いま」やっておくとよいこと(残り)

- [x] `user.email` フィールド追加(任意、本番で必須に昇格)
- [x] PRODUCTION.md(これ)で構成・移行リスクを書面化
- [x] リポジトリを `/web` + `/api` のモノレポ構成に再編成
- [ ] イベント作成時の入力バリデーションをサーバ側でも掛けられるよう、ロジックを純関数化(後の小改修で OK)
- [ ] 既存のクラウド sync(jsonbin.io)で運用中のデータがあれば、フィールド完備のために一度エクスポート → 確認しておく
- [ ] 委員会・役職マスターを「最終決定版」にする(本番ではユーザー数が一気に増えるので、最初の master が大事)
- [ ] AWS アカウント作成 + IAM 個人用ユーザの準備
- [ ] ドメインの取得(`お名前.com` / Route 53)

## 「本実装フェーズ」で着手する想定タスク

順番の目安:

1. ~~リポジトリ分割: `/web`(フロント)と `/api`(バックエンド)に分ける~~(済: モノレポ構成にしてある)
2. `/web` を React + TypeScript + Vite に置換(index.html をコンポーネント分解)
3. TypeScript 化 + 上記スキーマを型として書き起こす
4. Cognito で email 認証フロー実装(サインアップ/サインイン/招待)
5. API 実装(Express or Fastify)+ DB スキーマ
6. フロントの I/O 層を fetch ベースに置換(`loadState`/`saveState` を分解)
7. Lightsail にデプロイ + Let's Encrypt
8. SES 設定(送信ドメインの認証)
9. 既存 cloud sync データを移行スクリプトで取り込み

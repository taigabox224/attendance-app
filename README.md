# 出欠記録アプリ (プロトタイプ)
スマホでQR受付ができる出欠管理デモ。データはブラウザのストレージに保存。

## 構成
- `web/` — フロントエンド (Phase 1: `index.html` 単一ファイル / Phase 2: React + TS + Vite 予定)
- `api/` — バックエンド (Node.js + TypeScript + Vite ビルド)

## ローカル起動
```bash
cd web && python3 -m http.server 8000
# → http://localhost:8000
```

```bash
cd api && npm install && npm run dev
# → http://localhost:3001/health
```

## Make コマンド
```bash
make web
make api
make dev
make stop
make build
```

- `make web`: `web/` の `python3 -m http.server 8000`
- `make api`: `api/` の `npm install && npm run dev`
- `make dev`: `web` と `api` を同時起動（Ctrl+C で両方停止）
- `make stop`: `8000(web)` と `3001(api)` の待受プロセスを停止
- `make build`: `api/` の `npm run build` を実行

Phase 2 の本番化計画は [PRODUCTION.md](./PRODUCTION.md) を参照。

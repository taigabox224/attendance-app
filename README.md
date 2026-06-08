# 出欠記録アプリ
スマホでQR受付ができる出欠管理デモ。

## 構成
- `web/` — フロントエンド (Phase 2: React + TypeScript + Vite)
  - `web/legacy/` — Phase 1 プロトタイプの単一HTML版(参照用に保存)
- `api/` — バックエンド (Node.js + TypeScript + Fastify + better-sqlite3, Phase 2)

## ローカル起動
```bash
cd api && npm install && npm run dev
# → http://localhost:3000  (Fastify, /health で疎通確認)

cd web && npm install && npm run dev
# → http://localhost:5173  (Vite dev server, /api/* は :3000 にプロキシ)
```

## Make コマンド
```bash
make web      # web 側だけ起動
make api      # api 側だけ起動
make dev      # 両方同時起動 (Ctrl+C で両停止)
make stop     # 5173/3000 を listen しているプロセスを kill
make build    # web の本番ビルド (Vite, web/dist/)
make legacy   # Phase 1 プロトタイプを 8000 番で配信 (web/legacy/)
```

Phase 2 の本番化計画は [PRODUCTION.md](./PRODUCTION.md)、認証機能の仕様は [AUTH_FEATURE.md](./AUTH_FEATURE.md) を参照。



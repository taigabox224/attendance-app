# 出欠記録アプリ (プロトタイプ)
スマホでQR受付ができる出欠管理デモ。データはブラウザのストレージに保存。

## 構成
- `web/` — フロントエンド (Phase 1: `index.html` 単一ファイル / Phase 2: React + TS + Vite 予定)
- `api/` — バックエンド (Phase 2 で実装予定)
- `vercel.json` — Vercel に `/web` を配信対象として指定

## ローカル起動
```bash
cd web && python3 -m http.server 8000
# → http://localhost:8000
```

Phase 2 の本番化計画は [PRODUCTION.md](./PRODUCTION.md) を参照。

.PHONY: web api dev stop build legacy

# web: フロントエンド開発サーバー (Vite, http://localhost:5173)
web:
	cd web && npm install && npm run dev

# api: バックエンド開発サーバー (Fastify, http://localhost:3000/health)
api:
	cd api && npm install && npm run dev

# dev: 両サーバーを起動
dev:
	@set -e; \
	(cd web && npm install && npm run dev) & WEB_PID=$$!; \
	(cd api && npm install && npm run dev) & API_PID=$$!; \
	trap 'kill $$WEB_PID $$API_PID 2>/dev/null || true' INT TERM EXIT; \
	wait

# stop: フロントエンド (5173/Vite) と API (3000) の待受プロセスを停止
stop:
	@PIDS=$$(lsof -tiTCP:5173 -sTCP:LISTEN; lsof -tiTCP:3000 -sTCP:LISTEN); \
	if [ -n "$$PIDS" ]; then \
		echo "Stopping: $$PIDS"; \
		kill $$PIDS; \
	else \
		echo "No web/api server process found."; \
	fi

# build: web の本番ビルド (Vite)
build:
	cd web && npm install && npm run build

# legacy: Phase 1 のプロトタイプ単一HTML版を 8000 番で配信
legacy:
	cd web/legacy && python3 -m http.server 8000
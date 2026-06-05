.PHONY: web api dev stop build

# web: フロントエンドサーバーを起動 (http://localhost:8000)
web:
	cd web && python3 -m http.server 8000

# api: バックエンド開発サーバーを起動 (http://localhost:3001/health)
api:
	cd api && npm install && npm run dev

# dev: 両サーバーを起動
dev:
	@set -e; \
	(cd web && python3 -m http.server 8000) & WEB_PID=$$!; \
	(cd api && npm install && npm run dev) & API_PID=$$!; \
	trap 'kill $$WEB_PID $$API_PID 2>/dev/null || true' INT TERM EXIT; \
	wait

# stop: フロントエンドサーバー:8000(web) と API開発サーバー:3001(api) を停止
stop:
	@PIDS=$$(lsof -tiTCP:8000 -sTCP:LISTEN; lsof -tiTCP:3001 -sTCP:LISTEN); \
	if [ -n "$$PIDS" ]; then \
		echo "Stopping: $$PIDS"; \
		kill $$PIDS; \
	else \
		echo "No web/api server process found."; \
	fi

# build: ビルド実行
build:
	cd api && npm run build
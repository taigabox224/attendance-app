import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
const defaultPort = 3001;
const defaultCorsOrigin = "http://localhost:8000";
function buildServer() {
  const allowedOrigin = process.env.CORS_ORIGIN ?? defaultCorsOrigin;
  return createServer((req, res) => {
    const url = req.url ?? "/";
    const origin = req.headers.origin;
    if (origin === allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url === "/health") {
      if (req.method !== "GET") {
        res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ message: "Method Not Allowed" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ message: "Not Found" }));
  });
}
function startServer(port = defaultPort) {
  const server = buildServer();
  server.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });
  return server;
}
const isDirectRun = process.argv[1] !== void 0 && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const port = Number(process.env.PORT ?? defaultPort);
  startServer(port);
}
export {
  buildServer,
  startServer
};
//# sourceMappingURL=main.js.map

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const defaultPort = 3001;

export function buildServer() {
  return createServer((req, res) => {
    const url = req.url ?? "/";

    if (url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ message: "Not Found" }));
  });
}

export function startServer(port = defaultPort) {
  const server = buildServer();

  server.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });

  return server;
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const port = Number(process.env.PORT ?? defaultPort);
  startServer(port);
}


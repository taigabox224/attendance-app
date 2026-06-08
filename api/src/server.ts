import 'dotenv/config';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { runMigrations } from './db.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerEventRoutes } from './routes/events.js';

const app = Fastify({ logger: true });

const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:8000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

await app.register(cookie);
await app.register(cors, {
  origin: (origin, cb) => {
    // 同一オリジン(originヘッダなし)は許可
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
});

await registerAuthRoutes(app);
await registerAdminRoutes(app);
await registerEventRoutes(app);

app.get('/health', async () => ({ ok: true }));

runMigrations();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

await app.listen({ port, host });

import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // SQLite では `file:./data/app.db` のような URL を許容し、プレフィックスを剥がして使う。
  // 将来 PostgreSQL に切り替える際は `postgres://...` を別経路で扱う。
  if (!url.startsWith('file:')) {
    throw new Error(`Unsupported DATABASE_URL: ${url} (expected file:...)`);
  }
  return url.slice('file:'.length);
}

const dbPath = resolveDbPath();
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function runMigrations(): void {
  const migrationsDir = resolve(__dirname, '../migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    db.exec(sql);
  }
}

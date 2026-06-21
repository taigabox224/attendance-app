import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveDbPath() {
    const url = process.env.DATABASE_URL;
    if (!url)
        throw new Error('DATABASE_URL is not set');
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
export function runMigrations() {
    // 既に適用済みのファイル名を追跡するテーブル。SQLite は ALTER TABLE ADD COLUMN
    // が冪等でないため、ファイル単位の二度適用を防ぐ仕組みが必要。
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL
    );
  `);
    const migrationsDir = resolve(__dirname, '../migrations');
    const files = readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    const isApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?');
    const markApplied = db.prepare('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)');
    for (const file of files) {
        if (isApplied.get(file))
            continue;
        const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
        const apply = db.transaction(() => {
            db.exec(sql);
            markApplied.run(file, new Date().toISOString());
        });
        apply();
    }
}
//# sourceMappingURL=db.js.map
import 'dotenv/config';
import { runMigrations, db } from '../src/db.js';

runMigrations();
console.log(
  'Tables:',
  db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all(),
);
console.log(
  'Migrations:',
  db
    .prepare('SELECT filename FROM schema_migrations ORDER BY filename')
    .all(),
);
console.log(
  'events columns:',
  db.prepare("PRAGMA table_info('events')").all(),
);

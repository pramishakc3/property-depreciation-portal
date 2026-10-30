import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from src/ and src/cli/ (tsx) as well as dist/ and dist/cli/ (bundled)
const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ??
  [path.resolve(here, '../migrations'), path.resolve(here, '../../migrations')].find((p) => existsSync(p)) ??
  path.resolve(here, '../migrations');

/** Applies any .sql migrations that have not run yet, each in its own transaction. */
export async function migrate(db: Db, log: (msg: string) => void = console.log): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name as string));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(await readFile(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

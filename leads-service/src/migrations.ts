import fs from 'fs';
import path from 'path';
import * as db from './db';

/**
 * Runs each migration file once. Applied files are recorded in leads.schema_migrations and
 * skipped on the next start (LS-010). A failing migration throws; the server must not start.
 */
export async function runMigrations(): Promise<void> {
  const migrationsDir = path.resolve(__dirname, '../migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('[Migrations] Directory not found, skipping');
    return;
  }

  await db.query(`CREATE SCHEMA IF NOT EXISTS leads`);
  await db.query(
    `CREATE TABLE IF NOT EXISTS leads.schema_migrations (
       filename VARCHAR(200) PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  const applied = new Set(
    (await db.query<{ filename: string }>(`SELECT filename FROM leads.schema_migrations`)).rows.map((r) => r.filename)
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`[Migrations] Found ${files.length} migration file(s), ${applied.size} already applied`);

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    console.log(`[Migrations] Running ${file}...`);
    // One transaction per file: the file and its bookkeeping row succeed or fail together.
    await db.withTransaction(async (client) => {
      await client.query(sql);
      await client.query(`INSERT INTO leads.schema_migrations (filename) VALUES ($1)`, [file]);
    });
    console.log(`[Migrations] Completed ${file}`);
  }
}

import { app } from './app';
import { config } from './config';
import { runMigrations } from './migrations';

async function startServer() {
  try {
    console.log('[Server] Connecting to database and running migrations...');
    await runMigrations();
    console.log('[Server] Migrations finished successfully.');
  } catch (err) {
    // Never serve traffic on a half-migrated database (LS-010).
    console.error('[Server] Migrations failed, not starting:', (err as Error).message);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`[Server] Tidewave Leads Service running on port ${config.port}`);
  });
}

startServer();

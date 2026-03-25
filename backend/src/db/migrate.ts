import pool from './index';
import * as fs from 'fs';
import * as path from 'path';

export async function runMigrations(): Promise<void> {
  console.log('🔄 Running database migrations...');

  let client;
  try {
    client = await pool.connect();
  } catch (err: any) {
    throw new Error(`Migration failed: could not connect to database. ${err.message}`);
  }

  try {
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Helper to run a SQL file
    const runSqlFile = async (filePath: string, filename: string) => {
      // Files prefixed with "zzz_" are idempotent safety-nets and must run on
      // every startup so that any tables added to them after the initial deploy
      // are created on existing databases.
      const isZzz = filename.startsWith('zzz_');

      if (!isZzz) {
        // Check if already executed for normal migration files
        const result = await client.query(
          'SELECT id FROM _migrations WHERE filename = $1',
          [filename]
        );
        if (result.rows.length > 0) {
          console.log(`  ⏭️  Skipping ${filename} (already applied)`);
          return;
        }
      } else {
        console.log(`  🔄  Force-running ${filename} (zzz_ safety-net)...`);
      }

      console.log(`  ▶️  Applying ${filename}...`);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        // For zzz_ files use upsert so the record is created on first run and
        // updated on subsequent runs. The executed_at timestamp reflects when the
        // safety-net last ran, which is useful for debugging.
        if (isZzz) {
          await client.query(
            `INSERT INTO _migrations (filename, executed_at) VALUES ($1, NOW())
             ON CONFLICT (filename) DO UPDATE SET executed_at = NOW()`,
            [filename]
          );
        } else {
          await client.query(
            'INSERT INTO _migrations (filename) VALUES ($1)',
            [filename]
          );
        }
        await client.query('COMMIT');
        console.log(`  ✅ Applied ${filename}`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Failed to apply ${filename}: ${err.message}`);
        console.error(`     → This migration will be retried on next startup (not recorded in _migrations)`);
        // Don't throw — continue with next migration
      }
    };

    // 1. Run base schema
    const schemaPath = path.join(__dirname, '../../db/schema.sql');
    if (fs.existsSync(schemaPath)) {
      await runSqlFile(schemaPath, 'schema.sql');
    }

    // 2. Run all migration files in order
    const migrationsDir = path.join(__dirname, '../../db/migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort(); // alphabetical = numerical order by prefix

      for (const file of files) {
        await runSqlFile(path.join(migrationsDir, file), file);
      }
    }

    console.log('✅ Database migrations complete');
  } finally {
    client.release();
  }
}

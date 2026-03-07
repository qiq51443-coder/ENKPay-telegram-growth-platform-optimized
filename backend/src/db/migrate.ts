import pool from './index';
import * as fs from 'fs';
import * as path from 'path';

export async function runMigrations(): Promise<void> {
  console.log('🔄 Running database migrations...');

  const client = await pool.connect();

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
      // Check if already executed
      const result = await client.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [filename]
      );
      if (result.rows.length > 0) {
        console.log(`  ⏭️  Skipping ${filename} (already applied)`);
        return;
      }

      console.log(`  ▶️  Applying ${filename}...`);
      const sql = fs.readFileSync(filePath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`  ✅ Applied ${filename}`);
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Failed to apply ${filename}: ${err.message}`);
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

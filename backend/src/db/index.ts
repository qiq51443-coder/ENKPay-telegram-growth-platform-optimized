import { Pool, PoolClient, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Detect if we're connecting to a remote host (Render, etc.) and need SSL
const dbUrl = process.env.DATABASE_URL || '';
let isRemoteDb = false;
try {
  const parsed = new URL(dbUrl);
  const host = parsed.hostname;
  isRemoteDb = !!host && host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
} catch {
  // If URL parsing fails fall back to a simple string check
  isRemoteDb = dbUrl.includes('@') && !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1');
}

const poolConfig: PoolConfig = {
  connectionString: dbUrl,
  // Connection pool configuration optimized for Render Standard tier
  max: parseInt(process.env.DB_POOL_MAX || '10'),      // Maximum number of connections in the pool
  min: parseInt(process.env.DB_POOL_MIN || '1'),       // Minimum number of connections in the pool
  idleTimeoutMillis: 30000,                             // Close idle connections after 30 seconds
  connectionTimeoutMillis: 30000,                       // Connection timeout (30 seconds for cold-start)
  // Statement timeout
  statement_timeout: 30000,                             // Max execution time per statement (30 seconds)
  query_timeout: 30000,                                 // Query timeout
};

// Enable SSL for remote databases (Render, Heroku, Railway, Supabase, etc.).
// rejectUnauthorized is false because Render's free-tier Postgres uses a self-signed
// certificate; the traffic is still encrypted, only chain verification is skipped.
if (isRemoteDb) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

pool.on('connect', () => {
  // Only log pool creation, not every connection
  if (pool.totalCount === 1) {
    console.log('Database connection pool created');
  }
});

export const query = async (text: string, params?: any[]) => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

export const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  return client;
};

export const transaction = async (callback: (client: PoolClient) => Promise<any>) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Execute a callback within a SAVEPOINT so that if it throws, only the
 * savepoint is rolled back and the outer transaction remains valid.
 *
 * This is required whenever a try/catch inside a transaction needs to attempt
 * a fallback query — PostgreSQL marks the entire transaction as aborted on
 * any error, so without ROLLBACK TO SAVEPOINT the fallback queries also fail.
 */
export const withSavepoint = async <T>(
  client: PoolClient,
  name: string,
  callback: () => Promise<T>
): Promise<T> => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid savepoint name: ${name}`);
  }
  await client.query(`SAVEPOINT ${name}`);
  try {
    const result = await callback();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    throw err;
  }
};

// Health check function
export async function healthCheck(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (err) {
    console.error('Database health check failed:', err);
    return false;
  }
}

// Wait for DB to become reachable, retrying on failure (handles cold-start delays)
export async function waitForDb(retries = 10, delayMs = 5000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('✓ Database connection established');
      return;
    } catch (err: any) {
      console.warn(`⚠ DB not ready (attempt ${i}/${retries}): ${err.message}`);
      if (i < retries) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw new Error('Database connection failed after all retries');
}

// Get pool statistics
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

export function getPool() {
  return pool;
}

export default pool;

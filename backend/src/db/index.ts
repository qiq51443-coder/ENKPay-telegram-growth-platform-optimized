import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool configuration optimized for 20K users
  max: parseInt(process.env.DB_POOL_MAX || '50'),      // Maximum number of connections in the pool
  min: parseInt(process.env.DB_POOL_MIN || '10'),      // Minimum number of connections in the pool
  idleTimeoutMillis: 30000,                             // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000,                        // Connection timeout (5 seconds)
  // Statement timeout
  statement_timeout: 30000,                             // Max execution time per statement (30 seconds)
  query_timeout: 30000,                                 // Query timeout
});

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

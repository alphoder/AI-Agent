import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from './env';
import { logger } from './logger';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  min: 2,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

/**
 * Plain Postgres access. There is no multi-tenancy / RLS anymore — ownership is
 * enforced in each query's WHERE clause (`created_by = $me` / `user_id = $me`).
 */
export const db = {
  pool,

  query: (text: string, params?: unknown[]): Promise<QueryResult> => pool.query(text, params),

  connect: (): Promise<QueryResult> => pool.query('SELECT 1'),

  getClient: (): Promise<PoolClient> => pool.connect(),

  /** Run a callback inside a single transaction. */
  async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

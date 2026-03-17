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

// UUID v4 format validation to prevent SQL injection in tenant ID
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const db = {
  pool,

  query: (text: string, params?: unknown[]): Promise<QueryResult> => pool.query(text, params),

  connect: (): Promise<QueryResult> => pool.query('SELECT 1'),

  getClient: (): Promise<PoolClient> => pool.connect(),

  /**
   * Execute a callback within a tenant context.
   * Sets the Postgres session variable `app.current_tenant_id` for RLS.
   * Wraps everything in a transaction to ensure SET LOCAL scoping.
   */
  async withTenant<T>(tenantId: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!UUID_REGEX.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        tenantId,
      ]);
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

  /**
   * Execute a query within a tenant context (convenience method).
   */
  async tenantQuery(
    tenantId: string,
    text: string,
    params?: unknown[],
  ): Promise<QueryResult> {
    return this.withTenant(tenantId, async (client) => {
      return client.query(text, params);
    });
  },
};

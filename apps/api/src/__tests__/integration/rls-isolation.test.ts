import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// We do NOT mock ../../config/database here — we mock the pg Pool directly
// so we can test the real `db.withTenant` and `db.tenantQuery` logic.

jest.mock('../../config/env', () => ({
  config: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    NODE_ENV: 'test',
  },
}));

// ---------------------------------------------------------------------------
// Set up a mock pg Pool that captures query calls
// ---------------------------------------------------------------------------

const mockClientQueries: Array<{ text: string; params?: unknown[] }> = [];

const mockClient = {
  query: jest.fn().mockImplementation((text: string, params?: unknown[]) => {
    mockClientQueries.push({ text, params });
    return Promise.resolve({ rows: [], rowCount: 0 });
  }),
  release: jest.fn(),
};

const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue(mockClient),
  on: jest.fn(),
};

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => mockPool),
}));

// ---------------------------------------------------------------------------
// Import the database module (uses our mocked pg Pool)
// ---------------------------------------------------------------------------

import { db } from '../../config/database';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RLS Isolation', () => {
  const TENANT_A = '11111111-1111-1111-1111-111111111111';
  const TENANT_B = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    jest.clearAllMocks();
    mockClientQueries.length = 0;
    mockClient.query.mockImplementation((text: string, params?: unknown[]) => {
      mockClientQueries.push({ text, params });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  // ─── withTenant sets correct session variable ─────────────────────

  describe('withTenant', () => {
    it('sets app.current_tenant_id via set_config within a transaction', async () => {
      await db.withTenant(TENANT_A, async (client) => {
        return client.query('SELECT * FROM avatars');
      });

      // Should have: BEGIN, set_config, user query, COMMIT
      expect(mockClient.query).toHaveBeenCalledTimes(4);

      const calls = mockClientQueries;

      expect(calls[0].text).toBe('BEGIN');
      expect(calls[1].text).toBe('SELECT set_config($1, $2, true)');
      expect(calls[1].params).toEqual(['app.current_tenant_id', TENANT_A]);
      expect(calls[2].text).toBe('SELECT * FROM avatars');
      expect(calls[3].text).toBe('COMMIT');
    });

    it('rolls back transaction on error inside callback', async () => {
      await expect(
        db.withTenant(TENANT_A, async () => {
          throw new Error('Something went wrong');
        }),
      ).rejects.toThrow('Something went wrong');

      const calls = mockClientQueries;

      expect(calls[0].text).toBe('BEGIN');
      expect(calls[1].text).toBe('SELECT set_config($1, $2, true)');
      // The callback throws before doing a query, so next is ROLLBACK
      expect(calls[2].text).toBe('ROLLBACK');

      // Client should be released even on error
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('always releases the client', async () => {
      await db.withTenant(TENANT_A, async () => {});

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // ─── tenantQuery wraps in transaction ─────────────────────────────

  describe('tenantQuery', () => {
    it('wraps a single query in a tenant-scoped transaction', async () => {
      await db.tenantQuery(TENANT_B, 'SELECT id FROM personas WHERE tenant_id = $1', [TENANT_B]);

      const calls = mockClientQueries;

      // BEGIN -> set_config -> user query -> COMMIT
      expect(calls).toHaveLength(4);
      expect(calls[1].params).toEqual(['app.current_tenant_id', TENANT_B]);
      expect(calls[2].text).toBe('SELECT id FROM personas WHERE tenant_id = $1');
      expect(calls[2].params).toEqual([TENANT_B]);
    });
  });

  // ─── Tenant A cannot query tenant B's data ────────────────────────

  describe('Cross-tenant isolation', () => {
    it('sets different tenant IDs for different tenants', async () => {
      // Tenant A query
      await db.withTenant(TENANT_A, async (client) => {
        return client.query('SELECT * FROM avatars WHERE tenant_id = $1', [TENANT_A]);
      });

      const tenantASetConfig = mockClientQueries.find(
        (q) => q.text === 'SELECT set_config($1, $2, true)' && q.params?.[1] === TENANT_A,
      );
      expect(tenantASetConfig).toBeDefined();

      // Reset
      mockClientQueries.length = 0;
      mockClient.query.mockClear();

      // Tenant B query
      await db.withTenant(TENANT_B, async (client) => {
        return client.query('SELECT * FROM avatars WHERE tenant_id = $1', [TENANT_B]);
      });

      const tenantBSetConfig = mockClientQueries.find(
        (q) => q.text === 'SELECT set_config($1, $2, true)' && q.params?.[1] === TENANT_B,
      );
      expect(tenantBSetConfig).toBeDefined();

      // The set_config values are different for A vs B
      expect(tenantASetConfig!.params![1]).not.toBe(tenantBSetConfig!.params![1]);
    });

    it('scopes each transaction to only one tenant', async () => {
      // Simulate concurrent tenant queries
      const [resultA, resultB] = await Promise.all([
        db.tenantQuery(TENANT_A, 'SELECT * FROM avatars'),
        db.tenantQuery(TENANT_B, 'SELECT * FROM scenarios'),
      ]);

      // Both should have been called with their respective tenant IDs
      const setConfigCalls = mockClientQueries.filter(
        (q) => q.text === 'SELECT set_config($1, $2, true)',
      );

      expect(setConfigCalls).toHaveLength(2);
      const tenantIds = setConfigCalls.map((q) => q.params?.[1]);
      expect(tenantIds).toContain(TENANT_A);
      expect(tenantIds).toContain(TENANT_B);
    });
  });

  // ─── Invalid tenant ID format is rejected ─────────────────────────

  describe('Tenant ID validation', () => {
    it('rejects non-UUID tenant ID', async () => {
      await expect(
        db.withTenant('not-a-valid-uuid', async () => {}),
      ).rejects.toThrow('Invalid tenant ID format');
    });

    it('rejects SQL injection attempts in tenant ID', async () => {
      await expect(
        db.withTenant("'; DROP TABLE users; --", async () => {}),
      ).rejects.toThrow('Invalid tenant ID format');
    });

    it('rejects empty string tenant ID', async () => {
      await expect(
        db.withTenant('', async () => {}),
      ).rejects.toThrow('Invalid tenant ID format');
    });

    it('accepts a valid UUID v4 tenant ID', async () => {
      const validUUID = crypto.randomUUID();

      await expect(
        db.withTenant(validUUID, async () => 'ok'),
      ).resolves.toBe('ok');
    });

    it('rejects UUID-like strings with wrong character count', async () => {
      await expect(
        db.withTenant('11111111-1111-1111-1111-11111111111', async () => {}),
      ).rejects.toThrow('Invalid tenant ID format');
    });

    it('rejects UUID-like strings with invalid hex characters', async () => {
      await expect(
        db.withTenant('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', async () => {}),
      ).rejects.toThrow('Invalid tenant ID format');
    });
  });
});

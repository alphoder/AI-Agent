import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

jest.mock('../config/redis', () => ({
  redis: mockRedis,
  RedisKeys: {
    tenantConfig: (id: string) => `tenant:${id}:config`,
  },
  RedisTTL: {
    TENANT_CONFIG: 300,
  },
}));

// Mock database
const mockDb = {
  query: jest.fn(),
};

jest.mock('../config/database', () => ({
  db: mockDb,
}));

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { tenantMiddleware, TenantConfig } from '../middleware/tenant';

function createMockReq(user?: { sub: string; tid: string; role: string; email: string }): AuthenticatedRequest {
  return {
    user,
    params: {},
  } as unknown as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

const activeTenant: TenantConfig = {
  id: 'tenant-1',
  slug: 'acme',
  avatar_provider: 'simli',
  max_concurrent_sessions: 10,
  session_duration_limit_sec: 3600,
  idle_timeout_sec: 300,
  is_active: true,
};

const inactiveTenant: TenantConfig = {
  ...activeTenant,
  is_active: false,
};

describe('tenantMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('loads tenant config from Redis cache', async () => {
    const req = createMockReq({ sub: 'u1', tid: 'tenant-1', role: 'admin', email: 'a@b.com' });
    const res = createMockRes();

    mockRedis.get.mockResolvedValue(JSON.stringify(activeTenant));

    await tenantMiddleware(req, res, next);

    expect(mockRedis.get).toHaveBeenCalledWith('tenant:tenant-1:config');
    expect(mockDb.query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect((req as any).tenantConfig).toEqual(activeTenant);
  });

  it('loads from DB and caches when not in Redis', async () => {
    const req = createMockReq({ sub: 'u1', tid: 'tenant-1', role: 'admin', email: 'a@b.com' });
    const res = createMockRes();

    mockRedis.get.mockResolvedValue(null);
    mockDb.query.mockResolvedValue({ rows: [activeTenant] });
    mockRedis.set.mockResolvedValue('OK');

    await tenantMiddleware(req, res, next);

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT'),
      ['tenant-1'],
    );
    expect(mockRedis.set).toHaveBeenCalledWith(
      'tenant:tenant-1:config',
      JSON.stringify(activeTenant),
      'EX',
      300,
    );
    expect(next).toHaveBeenCalled();
  });

  it('rejects inactive tenant with 403', async () => {
    const req = createMockReq({ sub: 'u1', tid: 'tenant-1', role: 'admin', email: 'a@b.com' });
    const res = createMockRes();

    mockRedis.get.mockResolvedValue(JSON.stringify(inactiveTenant));

    await tenantMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'TENANT_INACTIVE' }),
      }),
    );
  });

  it('returns 400 for missing tenant ID', async () => {
    const req = createMockReq({ sub: 'u1', tid: undefined as any, role: 'admin', email: 'a@b.com' });
    const res = createMockRes();

    await tenantMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'MISSING_TENANT' }),
      }),
    );
  });

  it('returns 404 for tenant not found in DB', async () => {
    const req = createMockReq({ sub: 'u1', tid: 'nonexistent', role: 'admin', email: 'a@b.com' });
    const res = createMockRes();

    mockRedis.get.mockResolvedValue(null);
    mockDb.query.mockResolvedValue({ rows: [] });

    await tenantMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('calls next(err) on unexpected errors', async () => {
    const req = createMockReq({ sub: 'u1', tid: 'tenant-1', role: 'admin', email: 'a@b.com' });
    const res = createMockRes();
    const error = new Error('Redis down');

    mockRedis.get.mockRejectedValue(error);

    await tenantMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

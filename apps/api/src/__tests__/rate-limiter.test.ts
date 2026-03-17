import { Request, Response, NextFunction } from 'express';

// Mock Redis
const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
};

jest.mock('../config/redis', () => ({
  redis: mockRedis,
  RedisKeys: {
    rateLimit: (key: string) => `rate_limit:${key}`,
  },
  RedisTTL: {
    RATE_LIMIT: 60,
  },
}));

import { rateLimit } from '../middleware/rate-limit';

function createMockReq(ip: string = '127.0.0.1', path: string = '/api/test'): Request {
  return {
    ip,
    path,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('rateLimit middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('allows requests under the limit', async () => {
    const middleware = rateLimit(5);
    const req = createMockReq();
    const res = createMockRes();

    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sets expiry on first request in window', async () => {
    const middleware = rateLimit(5, 120);
    const req = createMockReq();
    const res = createMockRes();

    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);

    await middleware(req, res, next);

    expect(mockRedis.expire).toHaveBeenCalledWith(
      expect.stringContaining('rate_limit:'),
      120,
    );
  });

  it('does not reset expiry on subsequent requests', async () => {
    const middleware = rateLimit(5);
    const req = createMockReq();
    const res = createMockRes();

    mockRedis.incr.mockResolvedValue(3);

    await middleware(req, res, next);

    expect(mockRedis.expire).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('blocks requests over the limit with 429', async () => {
    const middleware = rateLimit(5);
    const req = createMockReq();
    const res = createMockRes();

    mockRedis.incr.mockResolvedValue(6);

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'RATE_LIMITED' }),
      }),
    );
  });

  it('allows exactly maxRequests', async () => {
    const middleware = rateLimit(5);
    const req = createMockReq();
    const res = createMockRes();

    mockRedis.incr.mockResolvedValue(5);

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('falls through on Redis errors', async () => {
    const middleware = rateLimit(5);
    const req = createMockReq();
    const res = createMockRes();

    mockRedis.incr.mockRejectedValue(new Error('Redis down'));

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

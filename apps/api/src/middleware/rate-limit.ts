import { Request, Response, NextFunction } from 'express';
import { redis, RedisKeys, RedisTTL } from '../config/redis';
import { logger } from '../config/logger';

// Atomic INCR + EXPIRE via Lua script (prevents race where crash between
// INCR and EXPIRE leaves a key without TTL — permanent rate limit).
const RATE_LIMIT_LUA = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  end
  return current
`;

export function rateLimit(maxRequests: number, windowSec: number = RedisTTL.RATE_LIMIT) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = RedisKeys.rateLimit(`${req.ip}:${req.path}`);
    try {
      const current = await redis.eval(RATE_LIMIT_LUA, 1, key, windowSec.toString()) as number;
      if (current > maxRequests) {
        return res.status(429).json({
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many requests' },
        });
      }
      next();
    } catch (err) {
      logger.warn({ err }, 'Rate limiter Redis error — bypassing rate limit');
      next();
    }
  };
}

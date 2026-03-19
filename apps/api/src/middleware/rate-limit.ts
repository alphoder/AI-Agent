import { Request, Response, NextFunction } from 'express';
import { redis, RedisKeys, RedisTTL } from '../config/redis';
import { logger } from '../config/logger';

export function rateLimit(maxRequests: number, windowSec: number = RedisTTL.RATE_LIMIT) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = RedisKeys.rateLimit(`${req.ip}:${req.path}`);
    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSec);
      }
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

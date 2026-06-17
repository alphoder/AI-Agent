import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

/**
 * In-memory fixed-window rate limiter. No Redis — fine at free-tier scale
 * (single instance). Keyed by client IP + path.
 */
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map can't grow unbounded.
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export function rateLimit(maxRequests: number, windowSec: number = 60) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (config.isDev) return next();

    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      sweep(now);
      return next();
    }

    bucket.count += 1;
    if (bucket.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
    }
    next();
  };
}

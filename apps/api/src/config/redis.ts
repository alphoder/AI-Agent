import Redis from 'ioredis';
import { config } from './env';
import { logger } from './logger';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

// Redis key schema with TTLs
export const RedisKeys = {
  sessionHistory: (sessionId: string) => `session:${sessionId}:history`,
  sessionState: (sessionId: string) => `session:${sessionId}:state`,
  tenantActiveSessions: (tenantId: string) => `tenant:${tenantId}:active_sessions`,
  rateLimit: (key: string) => `rate_limit:${key}`,
  ltiNonce: (nonce: string) => `lti:nonce:${nonce}`,
  tenantConfig: (tenantId: string) => `tenant:${tenantId}:config`,
  refreshToken: (tokenId: string) => `refresh:${tokenId}`,
} as const;

export const RedisTTL = {
  SESSION_HISTORY: 7200,    // 2 hours
  SESSION_STATE: 7200,      // 2 hours
  RATE_LIMIT: 60,           // 1 minute
  LTI_NONCE: 600,           // 10 minutes
  TENANT_CONFIG: 300,       // 5 minutes
  REFRESH_TOKEN: 604800,    // 7 days
} as const;

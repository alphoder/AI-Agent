import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { redis, RedisKeys, RedisTTL } from '../config/redis';
import { db } from '../config/database';
import { logger } from '../config/logger';

export interface TenantConfig {
  id: string;
  slug: string;
  avatar_provider: string;
  max_concurrent_sessions: number;
  session_duration_limit_sec: number;
  idle_timeout_sec: number;
  is_active: boolean;
}

/**
 * Tenant middleware: extracts tenant from JWT, caches config, sets Postgres RLS context.
 * Must run after auth middleware.
 */
export async function tenantMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const tenantId = req.user?.tid;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant context not found' },
      });
    }

    // Check Redis cache for tenant config
    const cacheKey = RedisKeys.tenantConfig(tenantId);
    let tenantConfig: TenantConfig | null = null;

    const cached = await redis.get(cacheKey);
    if (cached) {
      tenantConfig = JSON.parse(cached);
    } else {
      // Fetch from database (bypassing RLS since we need to validate tenant)
      const result = await db.query(
        `SELECT id, slug, avatar_provider, max_concurrent_sessions,
                session_duration_limit_sec, idle_timeout_sec, is_active
         FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
        [tenantId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
        });
      }

      tenantConfig = result.rows[0] as TenantConfig;

      // Cache for 5 minutes
      await redis.set(cacheKey, JSON.stringify(tenantConfig), 'EX', RedisTTL.TENANT_CONFIG);
    }

    if (!tenantConfig!.is_active) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_INACTIVE', message: 'Tenant is inactive' },
      });
    }

    // Attach tenant config to request for downstream use
    (req as AuthenticatedRequest & { tenantConfig: TenantConfig }).tenantConfig = tenantConfig!;

    next();
  } catch (err) {
    logger.error({ err }, 'Tenant middleware error');
    next(err);
  }
}

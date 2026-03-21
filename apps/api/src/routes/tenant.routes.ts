import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { rbac } from '../middleware/rbac';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { validateUuidParam } from '../middleware/validate-uuid';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();

router.use(authMiddleware as unknown as RequestHandler);
router.use(rateLimit(30, 60));

/**
 * GET /api/tenants/:id/settings
 * Get tenant settings (admin only, scoped to own tenant)
 */
router.get(
  '/:id/settings',
  validateUuidParam(),
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user!.tid;

    // Ensure admin can only read their own tenant
    if (req.params.id !== tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot access other tenant settings' },
      });
    }

    const result = await db.query(
      `SELECT id, name, slug, sso_provider, sso_metadata_url, sso_client_id,
              sso_config, avatar_provider, max_concurrent_sessions,
              session_duration_limit_sec, idle_timeout_sec, data_retention_days
       FROM tenants WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tenant not found' },
      });
    }

    // Never expose the encrypted secret to the frontend
    const tenant = result.rows[0];
    res.json({ success: true, data: tenant });
  }),
);

/**
 * PATCH /api/tenants/:id/settings
 * Update tenant settings (admin only, scoped to own tenant)
 */
router.patch(
  '/:id/settings',
  validateUuidParam(),
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.user!.tid;

    if (req.params.id !== tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot modify other tenant settings' },
      });
    }

    const {
      max_concurrent_sessions,
      session_duration_limit_sec,
      idle_timeout_sec,
      data_retention_days,
      avatar_provider,
      sso_provider,
      sso_metadata_url,
      sso_client_id,
      sso_client_secret,
      sso_config,
    } = req.body;

    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Session settings
    if (max_concurrent_sessions !== undefined) {
      const val = parseInt(max_concurrent_sessions);
      if (isNaN(val) || val < 1 || val > 500) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION', message: 'max_concurrent_sessions must be 1-500' },
        });
      }
      updates.push(`max_concurrent_sessions = $${paramIdx++}`);
      params.push(val);
    }

    if (session_duration_limit_sec !== undefined) {
      const val = parseInt(session_duration_limit_sec);
      if (isNaN(val) || val < 60 || val > 3600) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION', message: 'session_duration_limit_sec must be 60-3600' },
        });
      }
      updates.push(`session_duration_limit_sec = $${paramIdx++}`);
      params.push(val);
    }

    if (idle_timeout_sec !== undefined) {
      const val = parseInt(idle_timeout_sec);
      if (isNaN(val) || val < 15 || val > 300) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION', message: 'idle_timeout_sec must be 15-300' },
        });
      }
      updates.push(`idle_timeout_sec = $${paramIdx++}`);
      params.push(val);
    }

    if (data_retention_days !== undefined) {
      const val = parseInt(data_retention_days);
      if (isNaN(val) || val < 30 || val > 730) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION', message: 'data_retention_days must be 30-730' },
        });
      }
      updates.push(`data_retention_days = $${paramIdx++}`);
      params.push(val);
    }

    if (avatar_provider !== undefined) {
      if (!['simli', 'heygen'].includes(avatar_provider)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION', message: 'avatar_provider must be simli or heygen' },
        });
      }
      updates.push(`avatar_provider = $${paramIdx++}`);
      params.push(avatar_provider);
    }

    // SSO settings
    if (sso_provider !== undefined) {
      if (!['saml', 'oidc'].includes(sso_provider)) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION', message: 'sso_provider must be saml or oidc' },
        });
      }
      updates.push(`sso_provider = $${paramIdx++}`);
      params.push(sso_provider);
    }

    if (sso_metadata_url !== undefined) {
      updates.push(`sso_metadata_url = $${paramIdx++}`);
      params.push(sso_metadata_url || null);
    }

    if (sso_client_id !== undefined) {
      updates.push(`sso_client_id = $${paramIdx++}`);
      params.push(sso_client_id || null);
    }

    if (sso_client_secret !== undefined && sso_client_secret !== '') {
      // In production, this should be encrypted before storage
      updates.push(`sso_client_secret_encrypted = $${paramIdx++}`);
      params.push(sso_client_secret);
    }

    if (sso_config !== undefined) {
      updates.push(`sso_config = $${paramIdx++}`);
      params.push(JSON.stringify(sso_config));
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_UPDATES', message: 'No fields to update' },
      });
    }

    params.push(tenantId);
    const result = await db.query(
      `UPDATE tenants SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIdx} AND deleted_at IS NULL
       RETURNING id, name, slug, sso_provider, sso_metadata_url, sso_client_id,
                 sso_config, avatar_provider, max_concurrent_sessions,
                 session_duration_limit_sec, idle_timeout_sec, data_retention_days`,
      params,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Tenant not found' },
      });
    }

    logger.info({ tenantId, updatedFields: updates.length }, 'Tenant settings updated');

    res.json({ success: true, data: result.rows[0] });
  }),
);

export const tenantRoutes: Router = router;

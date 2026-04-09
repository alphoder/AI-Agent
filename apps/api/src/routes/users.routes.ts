import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { rbac } from '../middleware/rbac';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { logger } from '../config/logger';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();

router.use(authMiddleware as unknown as RequestHandler);
router.use(rateLimit(60, 60));

/**
 * GET /api/users
 * List users in the current tenant. Admin only.
 * Query params:
 *   role     = 'learner' | 'admin'  (optional filter)
 *   search   = substring of email or display_name  (optional)
 *   limit    = 1..200 (default 100)
 */
router.get(
  '/',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const role = typeof req.query.role === 'string' ? req.query.role : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));

      const params: unknown[] = [tenantId];
      let where = 'tenant_id = $1 AND deleted_at IS NULL';

      if (role) {
        if (role !== 'learner' && role !== 'admin') {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_ROLE', message: 'role must be learner or admin' },
          });
        }
        params.push(role);
        where += ` AND role = $${params.length}`;
      }

      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        where += ` AND (LOWER(email) LIKE $${params.length} OR LOWER(display_name) LIKE $${params.length})`;
      }

      params.push(limit);
      const result = await db.tenantQuery(
        tenantId,
        `SELECT id, email, display_name, role, is_active, last_login_at, created_at
         FROM users WHERE ${where}
         ORDER BY display_name ASC, email ASC
         LIMIT $${params.length}`,
        params,
      );

      res.json({
        success: true,
        data: result.rows,
        meta: { total: result.rows.length, limit },
      });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * POST /api/users/invite
 * Create (or reuse) a learner in the current tenant by email.
 * Idempotent — if the email already exists in this tenant, returns the existing
 * row and `created: false`. Useful for the admin "Invite learner" inline form.
 *
 * Body: { email: string, display_name?: string }
 */
router.post(
  '/invite',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const displayName = typeof req.body?.display_name === 'string' ? req.body.display_name.trim() : '';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_EMAIL', message: 'Valid email is required' },
        });
      }

      // Check if user already exists in this tenant
      const existing = await db.tenantQuery(
        tenantId,
        `SELECT id, email, display_name, role, is_active, created_at
         FROM users WHERE tenant_id = $1 AND LOWER(email) = $2 AND deleted_at IS NULL`,
        [tenantId, email],
      );

      if (existing.rows.length > 0) {
        return res.json({
          success: true,
          data: existing.rows[0],
          meta: { created: false },
        });
      }

      // Derive a display name from the email local-part if none was provided.
      // e.g. "jane.smith@acme.com" -> "Jane Smith"
      const resolvedDisplayName =
        displayName ||
        email
          .split('@')[0]
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase());

      const insert = await db.tenantQuery(
        tenantId,
        `INSERT INTO users (tenant_id, email, display_name, role, is_active)
         VALUES ($1, $2, $3, 'learner', true)
         RETURNING id, email, display_name, role, is_active, created_at`,
        [tenantId, email, resolvedDisplayName],
      );

      logger.info({ tenantId, userId: insert.rows[0].id, email }, 'Learner invited');

      res.status(201).json({
        success: true,
        data: insert.rows[0],
        meta: { created: true },
      });
    } catch (err) {
      next(err);
    }
  }),
);

export const usersRoutes: Router = router;

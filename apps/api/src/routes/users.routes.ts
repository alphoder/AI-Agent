import { Router, Response, NextFunction, RequestHandler } from 'express';
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

      const withStats = req.query.with_stats === '1' || req.query.with_stats === 'true';
      const a = withStats ? 'u.' : ''; // table alias prefix

      const params: unknown[] = [tenantId];
      let where = `${a}tenant_id = $1 AND ${a}deleted_at IS NULL`;

      if (role) {
        if (role !== 'learner' && role !== 'admin') {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_ROLE', message: 'role must be learner or admin' },
          });
        }
        params.push(role);
        where += ` AND ${a}role = $${params.length}`;
      }

      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        where += ` AND (LOWER(${a}email) LIKE $${params.length} OR LOWER(${a}display_name) LIKE $${params.length})`;
      }

      params.push(limit);
      const selectClause = withStats
        ? `u.id, u.email, u.display_name, u.role, u.is_active, u.last_login_at, u.created_at,
           (SELECT COUNT(*)::int FROM scenario_assignments sa WHERE sa.user_id = u.id) AS assignments_total,
           (SELECT COUNT(*)::int FROM scenario_assignments sa WHERE sa.user_id = u.id AND sa.status = 'completed') AS assignments_completed,
           (SELECT COUNT(*)::int FROM scenario_assignments sa WHERE sa.user_id = u.id AND sa.status = 'in_progress') AS assignments_in_progress,
           (SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = u.id) AS sessions_total,
           (SELECT ROUND(AVG(ss.overall_score)::numeric, 1)::float FROM session_scores ss
             JOIN sessions s ON s.id = ss.session_id
             WHERE s.user_id = u.id) AS avg_score,
           (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_session_at`
        : `id, email, display_name, role, is_active, last_login_at, created_at`;

      const result = await db.tenantQuery(
        tenantId,
        `SELECT ${selectClause}
         FROM users${withStats ? ' u' : ''} WHERE ${where}
         ORDER BY ${a}display_name ASC
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

/**
 * GET /api/users/:id
 * Full learner report: user info, all assignments (with session + score),
 * aggregate stats, and recent sessions. Admin only. Tenant-scoped.
 */
router.get(
  '/:id',
  validateUuidParam(),
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const userId = req.params.id;

      const userResult = await db.tenantQuery(
        tenantId,
        `SELECT u.id, u.email, u.display_name, u.role, u.is_active, u.last_login_at, u.created_at,
                (SELECT COUNT(*)::int FROM scenario_assignments sa WHERE sa.user_id = u.id) AS assignments_total,
                (SELECT COUNT(*)::int FROM scenario_assignments sa WHERE sa.user_id = u.id AND sa.status = 'completed') AS assignments_completed,
                (SELECT COUNT(*)::int FROM scenario_assignments sa WHERE sa.user_id = u.id AND sa.status = 'in_progress') AS assignments_in_progress,
                (SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = u.id) AS sessions_total,
                (SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = u.id AND s.status IN ('completed','ended')) AS sessions_completed,
                (SELECT ROUND(AVG(ss.overall_score)::numeric, 1)::float FROM session_scores ss
                  JOIN sessions s ON s.id = ss.session_id
                  WHERE s.user_id = u.id) AS avg_score,
                (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_session_at,
                (SELECT COALESCE(SUM(s.duration_sec), 0)::int FROM sessions s WHERE s.user_id = u.id) AS total_duration_sec
         FROM users u
         WHERE u.id = $1 AND u.tenant_id = $2 AND u.deleted_at IS NULL`,
        [userId, tenantId],
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        });
      }

      const user = userResult.rows[0];

      // Assignments with joined scenario + latest session score
      const assignmentsResult = await db.tenantQuery(
        tenantId,
        `SELECT sa.id AS assignment_id,
                sa.scenario_id,
                sa.status,
                sa.due_date,
                sa.created_at AS assigned_at,
                s.title AS scenario_title,
                s.difficulty_level,
                (SELECT sess.id FROM sessions sess
                   WHERE sess.assignment_id = sa.id
                   ORDER BY sess.created_at DESC LIMIT 1) AS latest_session_id,
                (SELECT sess.status FROM sessions sess
                   WHERE sess.assignment_id = sa.id
                   ORDER BY sess.created_at DESC LIMIT 1) AS latest_session_status,
                (SELECT ss.overall_score FROM session_scores ss
                   JOIN sessions sess ON sess.id = ss.session_id
                   WHERE sess.assignment_id = sa.id
                   ORDER BY sess.created_at DESC LIMIT 1) AS latest_score,
                (SELECT COUNT(*)::int FROM sessions sess WHERE sess.assignment_id = sa.id) AS session_count
         FROM scenario_assignments sa
         JOIN scenarios s ON s.id = sa.scenario_id
         WHERE sa.user_id = $1 AND s.deleted_at IS NULL
         ORDER BY sa.created_at DESC`,
        [userId],
      );

      // Recent sessions (last 10)
      const sessionsResult = await db.tenantQuery(
        tenantId,
        `SELECT s.id,
                s.status,
                s.duration_sec,
                s.created_at,
                sc.title AS scenario_title,
                ss.overall_score
         FROM sessions s
         JOIN scenarios sc ON sc.id = s.scenario_id
         LEFT JOIN session_scores ss ON ss.session_id = s.id
         WHERE s.user_id = $1
         ORDER BY s.created_at DESC
         LIMIT 10`,
        [userId],
      );

      res.json({
        success: true,
        data: {
          user,
          assignments: assignmentsResult.rows,
          recent_sessions: sessionsResult.rows,
        },
      });
    } catch (err) {
      next(err);
    }
  }),
);

export const usersRoutes: Router = router;

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
 * GET /api/assignments
 * List all assignments in the tenant with full context: scenario, persona,
 * avatar, learner. Admin only. Used by the Assignments admin page.
 *
 * Query params:
 *   status      = 'assigned' | 'in_progress' | 'completed'
 *   scenario_id = uuid
 *   user_id     = uuid
 *   limit       = 1..200 (default 100)
 */
router.get(
  '/',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));

      const params: unknown[] = [tenantId];
      let where = 'sa.tenant_id = $1';

      const status = req.query.status as string | undefined;
      if (status) {
        if (!['assigned', 'in_progress', 'completed'].includes(status)) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_STATUS', message: 'status must be assigned/in_progress/completed' },
          });
        }
        params.push(status);
        where += ` AND sa.status = $${params.length}`;
      }

      const scenarioId = req.query.scenario_id as string | undefined;
      if (scenarioId) {
        params.push(scenarioId);
        where += ` AND sa.scenario_id = $${params.length}`;
      }

      const userId = req.query.user_id as string | undefined;
      if (userId) {
        params.push(userId);
        where += ` AND sa.user_id = $${params.length}`;
      }

      params.push(limit);
      const result = await db.tenantQuery(
        tenantId,
        `SELECT sa.id AS assignment_id,
                sa.scenario_id,
                sa.user_id,
                sa.persona_id,
                sa.avatar_id,
                sa.status,
                sa.due_date,
                sa.scheduled_at,
                sa.notes,
                sa.language,
                sa.assigned_by,
                sa.created_at AS assigned_at,
                u.email AS learner_email,
                u.display_name AS learner_name,
                s.title AS scenario_title,
                s.difficulty_level,
                p.name AS persona_name,
                a.name AS avatar_name,
                a.gender AS avatar_gender,
                a.tts_voice_id,
                (SELECT sess.id FROM sessions sess
                   WHERE sess.assignment_id = sa.id
                   ORDER BY sess.created_at DESC LIMIT 1) AS latest_session_id,
                (SELECT ss.overall_score FROM session_scores ss
                   JOIN sessions sess ON sess.id = ss.session_id
                   WHERE sess.assignment_id = sa.id
                   ORDER BY sess.created_at DESC LIMIT 1) AS latest_score
         FROM scenario_assignments sa
         JOIN users u     ON u.id = sa.user_id AND u.deleted_at IS NULL
         JOIN scenarios s ON s.id = sa.scenario_id AND s.deleted_at IS NULL
         LEFT JOIN personas p ON p.id = sa.persona_id AND p.deleted_at IS NULL
         LEFT JOIN avatars a  ON a.id = sa.avatar_id AND a.deleted_at IS NULL
         WHERE ${where}
         ORDER BY sa.created_at DESC
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
 * POST /api/assignments
 * Create assignments from the wizard. Body:
 *   {
 *     scenario_id: uuid,
 *     persona_id: uuid,   // optional override; falls back to scenario.persona_id
 *     avatar_id: uuid,    // optional override; falls back to persona.avatar_id
 *     user_ids: uuid[],
 *     due_date?: iso timestamp
 *   }
 *
 * One row per learner. Idempotent on (scenario_id, user_id) — re-assigning
 * updates persona/avatar/due_date instead of inserting duplicates.
 */
router.post(
  '/',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const assignedBy = req.user!.sub;
      const { scenario_id, persona_id, avatar_id, user_ids, due_date, scheduled_at, notes, language } = req.body || {};

      // Validate language: short ISO code or null/empty (means "use avatar default")
      let languageCode: string | null = null;
      if (language != null && typeof language === 'string' && language.trim()) {
        const l = language.trim().toLowerCase().slice(0, 5);
        if (!/^[a-z]{2,3}(-[a-z]{2})?$/.test(l)) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_LANGUAGE', message: 'language must be an ISO 639-1 code (e.g. en, es, hi)' },
          });
        }
        languageCode = l.slice(0, 2);
      }

      if (!scenario_id) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_SCENARIO', message: 'scenario_id is required' },
        });
      }
      if (!Array.isArray(user_ids) || user_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_USERS', message: 'user_ids must be a non-empty array' },
        });
      }

      // Verify scenario belongs to tenant and is active
      const scenarioCheck = await db.tenantQuery(
        tenantId,
        `SELECT id, status, persona_id FROM scenarios
         WHERE id = $1 AND deleted_at IS NULL`,
        [scenario_id],
      );
      if (scenarioCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scenario not found' },
        });
      }
      if (scenarioCheck.rows[0].status !== 'active') {
        return res.status(400).json({
          success: false,
          error: { code: 'SCENARIO_INACTIVE', message: 'Scenario must be active to assign' },
        });
      }

      const effectivePersonaId = persona_id || scenarioCheck.rows[0].persona_id;
      let effectiveAvatarId: string | null = avatar_id || null;

      // If no avatar supplied, fall back to the persona's linked avatar
      if (!effectiveAvatarId && effectivePersonaId) {
        const pa = await db.tenantQuery(
          tenantId,
          `SELECT avatar_id FROM personas WHERE id = $1 AND deleted_at IS NULL`,
          [effectivePersonaId],
        );
        effectiveAvatarId = pa.rows[0]?.avatar_id || null;
      }

      // Validate persona/avatar exist in the tenant if provided
      if (effectivePersonaId) {
        const p = await db.tenantQuery(
          tenantId,
          `SELECT id FROM personas WHERE id = $1 AND deleted_at IS NULL`,
          [effectivePersonaId],
        );
        if (p.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_PERSONA', message: 'Persona not found in tenant' },
          });
        }
      }
      if (effectiveAvatarId) {
        const a = await db.tenantQuery(
          tenantId,
          `SELECT id FROM avatars WHERE id = $1 AND deleted_at IS NULL`,
          [effectiveAvatarId],
        );
        if (a.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_AVATAR', message: 'Avatar not found in tenant' },
          });
        }
      }

      // Validate all user_ids are learners in the tenant
      const userCheck = await db.tenantQuery(
        tenantId,
        `SELECT id FROM users
         WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND role = 'learner' AND deleted_at IS NULL`,
        [user_ids, tenantId],
      );
      const validIds = new Set(userCheck.rows.map((r: any) => r.id));
      const invalidIds = user_ids.filter((id: string) => !validIds.has(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USERS',
            message: `Users not found or not learners: ${invalidIds.join(', ')}`,
          },
        });
      }

      // Bulk upsert: one row per learner
      const result = await db.tenantQuery(
        tenantId,
        `INSERT INTO scenario_assignments
           (tenant_id, scenario_id, user_id, persona_id, avatar_id, assigned_by,
            due_date, scheduled_at, notes, language)
         SELECT $1, $2, unnest($3::uuid[]), $4, $5, $6, $7, $8, $9, $10
         ON CONFLICT (scenario_id, user_id) DO UPDATE SET
           persona_id   = EXCLUDED.persona_id,
           avatar_id    = EXCLUDED.avatar_id,
           due_date     = COALESCE(EXCLUDED.due_date, scenario_assignments.due_date),
           scheduled_at = COALESCE(EXCLUDED.scheduled_at, scenario_assignments.scheduled_at),
           notes        = COALESCE(EXCLUDED.notes, scenario_assignments.notes),
           language     = COALESCE(EXCLUDED.language, scenario_assignments.language),
           updated_at   = NOW()
         RETURNING id, scenario_id, user_id, persona_id, avatar_id, status,
                   due_date, scheduled_at, notes, language, created_at`,
        [
          tenantId,
          scenario_id,
          user_ids,
          effectivePersonaId || null,
          effectiveAvatarId || null,
          assignedBy,
          due_date || null,
          scheduled_at || null,
          typeof notes === 'string' && notes.trim() ? notes.trim() : null,
          languageCode,
        ],
      );

      logger.info(
        { tenantId, scenario_id, personaId: effectivePersonaId, avatarId: effectiveAvatarId, count: result.rows.length },
        'Assignments created via wizard',
      );

      res.status(201).json({
        success: true,
        data: result.rows,
        meta: {
          assigned: result.rows.length,
          requested: user_ids.length,
          persona_id: effectivePersonaId,
          avatar_id: effectiveAvatarId,
        },
      });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * DELETE /api/assignments/:id
 */
router.delete(
  '/:id',
  validateUuidParam(),
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const assignmentId = req.params.id;

      // Block deletion if there is an active session
      const activeCheck = await db.tenantQuery(
        tenantId,
        `SELECT COUNT(*)::int AS n FROM sessions
         WHERE assignment_id = $1 AND status IN ('created', 'active')`,
        [assignmentId],
      );
      if (activeCheck.rows[0].n > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ACTIVE_SESSIONS',
            message: 'Cannot delete assignment with an active session',
          },
        });
      }

      const result = await db.tenantQuery(
        tenantId,
        `DELETE FROM scenario_assignments
         WHERE id = $1 AND tenant_id = $2
         RETURNING id`,
        [assignmentId, tenantId],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Assignment not found' },
        });
      }
      res.json({ success: true, data: { id: result.rows[0].id, deleted: true } });
    } catch (err) {
      next(err);
    }
  }),
);

export const assignmentsRoutes: Router = router;

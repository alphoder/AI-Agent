import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { rbac } from '../middleware/rbac';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { auditLog } from '../middleware/audit-logger';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);
router.use(tenantMiddleware as unknown as RequestHandler);

// ---------------------------------------------------------------------------
// Rubric validation
// ---------------------------------------------------------------------------
function validateRubric(rubric: any[]): string | null {
  if (!Array.isArray(rubric) || rubric.length === 0) return 'Rubric must be a non-empty array';
  if (rubric.length > 10) return 'Maximum 10 criteria allowed';

  let totalWeight = 0;

  for (const criterion of rubric) {
    if (!criterion.name?.trim()) return 'Each criterion must have a name';
    if (!criterion.description?.trim()) return 'Each criterion must have a description';
    if (typeof criterion.weight !== 'number' || criterion.weight <= 0) return 'Each criterion must have a positive weight';

    totalWeight += criterion.weight;

    if (!Array.isArray(criterion.levels) || criterion.levels.length === 0) {
      return `Criterion "${criterion.name}" must have levels`;
    }

    const scores = new Set<number>();
    for (const level of criterion.levels) {
      if (typeof level.score !== 'number' || level.score < 1 || level.score > 5) {
        return `Level scores must be between 1 and 5 in criterion "${criterion.name}"`;
      }
      if (scores.has(level.score)) {
        return `Duplicate score ${level.score} in criterion "${criterion.name}"`;
      }
      scores.add(level.score);
      if (!level.label?.trim()) return `Each level must have a label in criterion "${criterion.name}"`;
      if (!level.description?.trim()) return `Each level must have a description in criterion "${criterion.name}"`;
    }
  }

  if (totalWeight !== 100) return `Rubric weights must sum to 100 (current: ${totalWeight})`;

  return null;
}

// Valid status transitions: draft -> active -> archived, archived -> draft
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['active'],
  active: ['archived'],
  archived: ['draft'],
};

// ---------------------------------------------------------------------------
// POST /api/scenarios – Create scenario (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const userId = req.user!.sub;

      const {
        persona_id,
        title,
        description,
        objective,
        opening_context,
        opening_message,
        scoring_rubric,
        max_duration_sec,
        max_turns,
        difficulty_level,
        tags,
      } = req.body;

      // Required field validation
      if (!title?.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_TITLE', message: 'Scenario title is required' },
        });
      }

      if (!persona_id) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_PERSONA', message: 'Persona ID is required' },
        });
      }

      if (!objective?.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_OBJECTIVE', message: 'Scenario objective is required' },
        });
      }

      // Validate rubric
      const rubricError = validateRubric(scoring_rubric);
      if (rubricError) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_RUBRIC', message: rubricError },
        });
      }

      // Validate difficulty_level if provided
      const validDifficulties = ['beginner', 'intermediate', 'advanced'];
      if (difficulty_level && !validDifficulties.includes(difficulty_level)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_DIFFICULTY', message: 'Difficulty level must be beginner, intermediate, or advanced' },
        });
      }

      // Verify persona exists in same tenant
      const personaCheck = await db.tenantQuery(
        tenantId,
        `SELECT id FROM personas WHERE id = $1 AND deleted_at IS NULL`,
        [persona_id],
      );

      if (personaCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'PERSONA_NOT_FOUND', message: 'Persona not found' },
        });
      }

      const result = await db.tenantQuery(
        tenantId,
        `INSERT INTO scenarios (
           tenant_id, persona_id, title, description, objective,
           opening_context, opening_message, scoring_rubric,
           status, max_duration_sec, max_turns, difficulty_level,
           tags, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'draft', $9, $10, $11, $12, $13)
         RETURNING id, tenant_id, persona_id, title, description, objective,
                   opening_context, opening_message, scoring_rubric,
                   status, max_duration_sec, max_turns, difficulty_level,
                   tags, created_by, created_at, updated_at`,
        [
          tenantId,
          persona_id,
          title.trim(),
          description?.trim() || null,
          objective.trim(),
          opening_context?.trim() || null,
          opening_message?.trim() || null,
          JSON.stringify(scoring_rubric),
          max_duration_sec ?? 600,
          max_turns ?? 50,
          difficulty_level || 'intermediate',
          tags || '{}',
          userId,
        ],
      );

      // Fire-and-forget audit log
      auditLog({
        tenantId,
        userId,
        action: 'scenario.create',
        resourceType: 'scenario',
        resourceId: result.rows[0].id,
        details: { title: title.trim() },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/scenarios – Paginated list with stats (admin only)
// ---------------------------------------------------------------------------
router.get(
  '/',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      // Optional filters
      const statusFilter = req.query.status as string | undefined;
      const difficultyFilter = req.query.difficulty as string | undefined;

      const conditions: string[] = ['s.tenant_id = $1', 's.deleted_at IS NULL'];
      const params: unknown[] = [tenantId];
      let paramIdx = 2;

      if (statusFilter && ['draft', 'active', 'archived'].includes(statusFilter)) {
        conditions.push(`s.status = $${paramIdx++}`);
        params.push(statusFilter);
      }

      if (difficultyFilter && ['beginner', 'intermediate', 'advanced'].includes(difficultyFilter)) {
        conditions.push(`s.difficulty_level = $${paramIdx++}`);
        params.push(difficultyFilter);
      }

      const whereClause = conditions.join(' AND ');

      const [dataResult, countResult] = await Promise.all([
        db.tenantQuery(
          tenantId,
          `SELECT s.id, s.title, s.description, s.status, s.difficulty_level,
                  s.persona_id, s.tags, s.max_duration_sec, s.max_turns,
                  s.created_by, s.created_at, s.updated_at,
                  p.name AS persona_name,
                  a.thumbnail_url AS persona_thumbnail_url,
                  COUNT(DISTINCT sa.id)::int AS assignment_count,
                  COUNT(DISTINCT CASE WHEN sa.status = 'completed' THEN sa.id END)::int AS completed_count,
                  ROUND(AVG(
                    CASE WHEN sess.overall_score IS NOT NULL THEN sess.overall_score END
                  )::numeric, 2) AS avg_score
           FROM scenarios s
           LEFT JOIN personas p ON s.persona_id = p.id AND p.deleted_at IS NULL
           LEFT JOIN avatars a ON p.avatar_id = a.id AND a.deleted_at IS NULL
           LEFT JOIN scenario_assignments sa ON s.id = sa.scenario_id
           LEFT JOIN sessions sess ON sess.scenario_id = s.id AND sess.status = 'completed'
           WHERE ${whereClause}
           GROUP BY s.id, p.name, a.thumbnail_url
           ORDER BY s.created_at DESC
           LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          [...params, limit, offset],
        ),
        db.tenantQuery(
          tenantId,
          `SELECT COUNT(*) FROM scenarios s WHERE ${whereClause}`,
          params,
        ),
      ]);

      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        data: dataResult.rows,
        meta: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/scenarios/assignments/me – Learner's own assignments
// Must be defined BEFORE /:id to avoid route collision
// ---------------------------------------------------------------------------
router.get(
  '/assignments/me',
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const userId = req.user!.sub;

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      const [dataResult, countResult] = await Promise.all([
        db.tenantQuery(
          tenantId,
          `SELECT sa.id AS assignment_id, sa.scenario_id, sa.status AS assignment_status,
                  sa.due_date, sa.created_at AS assigned_at,
                  s.title, s.description, s.objective, s.difficulty_level,
                  s.max_duration_sec, s.max_turns, s.status AS scenario_status,
                  s.opening_context, s.opening_message, s.tags,
                  p.name AS persona_name, p.description AS persona_description,
                  a.thumbnail_url AS persona_thumbnail_url
           FROM scenario_assignments sa
           JOIN scenarios s ON sa.scenario_id = s.id AND s.deleted_at IS NULL
           LEFT JOIN personas p ON s.persona_id = p.id AND p.deleted_at IS NULL
           LEFT JOIN avatars a ON p.avatar_id = a.id AND a.deleted_at IS NULL
           WHERE sa.user_id = $1 AND sa.tenant_id = $2
           ORDER BY sa.due_date ASC NULLS LAST, sa.created_at DESC
           LIMIT $3 OFFSET $4`,
          [userId, tenantId, limit, offset],
        ),
        db.tenantQuery(
          tenantId,
          `SELECT COUNT(*)
           FROM scenario_assignments sa
           JOIN scenarios s ON sa.scenario_id = s.id AND s.deleted_at IS NULL
           WHERE sa.user_id = $1 AND sa.tenant_id = $2`,
          [userId, tenantId],
        ),
      ]);

      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        data: dataResult.rows,
        meta: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /api/scenarios/:id – Full scenario details
// ---------------------------------------------------------------------------
router.get('/:id', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tid;

    const result = await db.tenantQuery(
      tenantId,
      `SELECT s.id, s.tenant_id, s.persona_id, s.title, s.description,
              s.objective, s.opening_context, s.opening_message,
              s.scoring_rubric, s.status, s.max_duration_sec, s.max_turns,
              s.difficulty_level, s.tags, s.created_by,
              s.created_at, s.updated_at,
              p.name AS persona_name, p.description AS persona_description,
              p.system_prompt AS persona_system_prompt,
              a.name AS avatar_name, a.thumbnail_url AS avatar_thumbnail_url,
              a.provider AS avatar_provider, a.status AS avatar_status
       FROM scenarios s
       LEFT JOIN personas p ON s.persona_id = p.id AND p.deleted_at IS NULL
       LEFT JOIN avatars a ON p.avatar_id = a.id AND a.deleted_at IS NULL
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scenario not found' },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}));

// ---------------------------------------------------------------------------
// PATCH /api/scenarios/:id – Update scenario (admin only)
// Cannot modify scenarios with active sessions
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const scenarioId = req.params.id;

      // Fetch current scenario
      const current = await db.tenantQuery(
        tenantId,
        `SELECT id, status FROM scenarios WHERE id = $1 AND deleted_at IS NULL`,
        [scenarioId],
      );

      if (current.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scenario not found' },
        });
      }

      const currentStatus = current.rows[0].status;

      // Check for active sessions
      const sessionCheck = await db.tenantQuery(
        tenantId,
        `SELECT COUNT(*) FROM sessions
         WHERE scenario_id = $1 AND status IN ('created', 'active')`,
        [scenarioId],
      );

      const activeCount = parseInt(sessionCheck.rows[0].count);
      if (activeCount > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ACTIVE_SESSIONS',
            message: `Cannot modify scenario with ${activeCount} active session(s)`,
          },
        });
      }

      const {
        title,
        description,
        objective,
        opening_context,
        opening_message,
        scoring_rubric,
        status,
        max_duration_sec,
        max_turns,
        difficulty_level,
        tags,
        persona_id,
      } = req.body;

      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (title !== undefined) {
        if (!title?.trim()) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_TITLE', message: 'Title cannot be empty' },
          });
        }
        updates.push(`title = $${paramIdx++}`);
        params.push(title.trim());
      }

      if (description !== undefined) {
        updates.push(`description = $${paramIdx++}`);
        params.push(description?.trim() || null);
      }

      if (objective !== undefined) {
        if (!objective?.trim()) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_OBJECTIVE', message: 'Objective cannot be empty' },
          });
        }
        updates.push(`objective = $${paramIdx++}`);
        params.push(objective.trim());
      }

      if (opening_context !== undefined) {
        updates.push(`opening_context = $${paramIdx++}`);
        params.push(opening_context?.trim() || null);
      }

      if (opening_message !== undefined) {
        updates.push(`opening_message = $${paramIdx++}`);
        params.push(opening_message?.trim() || null);
      }

      if (scoring_rubric !== undefined) {
        const rubricError = validateRubric(scoring_rubric);
        if (rubricError) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_RUBRIC', message: rubricError },
          });
        }
        updates.push(`scoring_rubric = $${paramIdx++}::jsonb`);
        params.push(JSON.stringify(scoring_rubric));
      }

      if (status !== undefined) {
        const allowed = VALID_TRANSITIONS[currentStatus];
        if (!allowed || !allowed.includes(status)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_STATUS_TRANSITION',
              message: `Cannot transition from "${currentStatus}" to "${status}". Allowed: ${(allowed || []).join(', ') || 'none'}`,
            },
          });
        }
        updates.push(`status = $${paramIdx++}`);
        params.push(status);
      }

      if (max_duration_sec !== undefined) {
        if (typeof max_duration_sec !== 'number' || max_duration_sec <= 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_DURATION', message: 'Max duration must be a positive number' },
          });
        }
        updates.push(`max_duration_sec = $${paramIdx++}`);
        params.push(max_duration_sec);
      }

      if (max_turns !== undefined) {
        if (typeof max_turns !== 'number' || max_turns <= 0) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_TURNS', message: 'Max turns must be a positive number' },
          });
        }
        updates.push(`max_turns = $${paramIdx++}`);
        params.push(max_turns);
      }

      if (difficulty_level !== undefined) {
        const validDifficulties = ['beginner', 'intermediate', 'advanced'];
        if (!validDifficulties.includes(difficulty_level)) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_DIFFICULTY', message: 'Difficulty level must be beginner, intermediate, or advanced' },
          });
        }
        updates.push(`difficulty_level = $${paramIdx++}`);
        params.push(difficulty_level);
      }

      if (tags !== undefined) {
        updates.push(`tags = $${paramIdx++}`);
        params.push(tags);
      }

      if (persona_id !== undefined) {
        // Verify persona exists in same tenant
        const personaCheck = await db.tenantQuery(
          tenantId,
          `SELECT id FROM personas WHERE id = $1 AND deleted_at IS NULL`,
          [persona_id],
        );

        if (personaCheck.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: { code: 'PERSONA_NOT_FOUND', message: 'Persona not found' },
          });
        }
        updates.push(`persona_id = $${paramIdx++}`);
        params.push(persona_id);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_UPDATES', message: 'No fields to update' },
        });
      }

      updates.push(`updated_at = NOW()`);
      params.push(scenarioId);

      const result = await db.tenantQuery(
        tenantId,
        `UPDATE scenarios SET ${updates.join(', ')}
         WHERE id = $${paramIdx} AND deleted_at IS NULL
         RETURNING id, tenant_id, persona_id, title, description, objective,
                   opening_context, opening_message, scoring_rubric,
                   status, max_duration_sec, max_turns, difficulty_level,
                   tags, created_by, created_at, updated_at`,
        params,
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scenario not found' },
        });
      }

      // Fire-and-forget audit log
      auditLog({
        tenantId,
        userId: req.user!.sub,
        action: 'scenario.update',
        resourceType: 'scenario',
        resourceId: scenarioId,
        details: { updatedFields: updates.map((u: string) => u.split(' = ')[0]) },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/scenarios/:id – Soft delete (admin only)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const scenarioId = req.params.id;

      // Check for active sessions
      const sessionCheck = await db.tenantQuery(
        tenantId,
        `SELECT COUNT(*) FROM sessions
         WHERE scenario_id = $1 AND status IN ('created', 'active')`,
        [scenarioId],
      );

      const activeCount = parseInt(sessionCheck.rows[0].count);
      if (activeCount > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ACTIVE_SESSIONS',
            message: `Cannot delete scenario with ${activeCount} active session(s)`,
          },
        });
      }

      const result = await db.tenantQuery(
        tenantId,
        `UPDATE scenarios SET deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [scenarioId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scenario not found' },
        });
      }

      // Fire-and-forget audit log
      auditLog({
        tenantId,
        userId: req.user!.sub,
        action: 'scenario.delete',
        resourceType: 'scenario',
        resourceId: scenarioId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.json({ success: true, data: { id: result.rows[0].id, deleted: true } });
    } catch (err) {
      next(err);
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/scenarios/:id/assign – Bulk assign learners (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/:id/assign',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const assignedBy = req.user!.sub;
      const scenarioId = req.params.id;
      const { user_ids, due_date } = req.body;

      if (!Array.isArray(user_ids) || user_ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_USERS', message: 'user_ids must be a non-empty array' },
        });
      }

      // Verify scenario exists and is active
      const scenarioCheck = await db.tenantQuery(
        tenantId,
        `SELECT id, status FROM scenarios WHERE id = $1 AND deleted_at IS NULL`,
        [scenarioId],
      );

      if (scenarioCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scenario not found' },
        });
      }

      // Verify all user_ids are learners in the same tenant
      const userCheck = await db.tenantQuery(
        tenantId,
        `SELECT id FROM users
         WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND role = 'learner' AND deleted_at IS NULL`,
        [user_ids, tenantId],
      );

      const validUserIds = new Set(userCheck.rows.map((r: any) => r.id));
      const invalidUserIds = user_ids.filter((id: string) => !validUserIds.has(id));

      if (invalidUserIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_USERS',
            message: `Users not found or not learners: ${invalidUserIds.join(', ')}`,
          },
        });
      }

      // Bulk insert with ON CONFLICT for idempotency
      const result = await db.tenantQuery(
        tenantId,
        `INSERT INTO scenario_assignments (tenant_id, scenario_id, user_id, assigned_by, due_date)
         SELECT $1, $2, unnest($3::uuid[]), $4, $5
         ON CONFLICT (scenario_id, user_id) DO UPDATE SET
           due_date = COALESCE(EXCLUDED.due_date, scenario_assignments.due_date),
           updated_at = NOW()
         RETURNING id, scenario_id, user_id, status, due_date, assigned_by, created_at`,
        [tenantId, scenarioId, user_ids, assignedBy, due_date || null],
      );

      res.status(201).json({
        success: true,
        data: result.rows,
        meta: {
          assigned: result.rows.length,
          requested: user_ids.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }),
);

// ---------------------------------------------------------------------------
// DELETE /api/scenarios/:id/assign/:userId – Unassign learner (admin only)
// ---------------------------------------------------------------------------
router.delete(
  '/:id/assign/:userId',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const { id: scenarioId, userId } = req.params;

      // Check for active sessions for this assignment
      const sessionCheck = await db.tenantQuery(
        tenantId,
        `SELECT COUNT(*) FROM sessions s
         JOIN scenario_assignments sa ON s.assignment_id = sa.id
         WHERE sa.scenario_id = $1 AND sa.user_id = $2 AND s.status IN ('created', 'active')`,
        [scenarioId, userId],
      );

      const activeCount = parseInt(sessionCheck.rows[0].count);
      if (activeCount > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ACTIVE_SESSIONS',
            message: `Cannot unassign learner with ${activeCount} active session(s)`,
          },
        });
      }

      const result = await db.tenantQuery(
        tenantId,
        `DELETE FROM scenario_assignments
         WHERE scenario_id = $1 AND user_id = $2 AND tenant_id = $3
         RETURNING id`,
        [scenarioId, userId, tenantId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Assignment not found' },
        });
      }

      res.json({ success: true, data: { id: result.rows[0].id, unassigned: true } });
    } catch (err) {
      next(err);
    }
  }),
);

// ---------------------------------------------------------------------------
// POST /api/scenarios/:id/duplicate – Deep copy scenario (admin only)
// ---------------------------------------------------------------------------
router.post(
  '/:id/duplicate',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const userId = req.user!.sub;
      const scenarioId = req.params.id;

      // Fetch the source scenario
      const source = await db.tenantQuery(
        tenantId,
        `SELECT persona_id, title, description, objective,
                opening_context, opening_message, scoring_rubric,
                max_duration_sec, max_turns, difficulty_level, tags
         FROM scenarios
         WHERE id = $1 AND deleted_at IS NULL`,
        [scenarioId],
      );

      if (source.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scenario not found' },
        });
      }

      const s = source.rows[0];

      const result = await db.tenantQuery(
        tenantId,
        `INSERT INTO scenarios (
           tenant_id, persona_id, title, description, objective,
           opening_context, opening_message, scoring_rubric,
           status, max_duration_sec, max_turns, difficulty_level,
           tags, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'draft', $9, $10, $11, $12, $13)
         RETURNING id, tenant_id, persona_id, title, description, objective,
                   opening_context, opening_message, scoring_rubric,
                   status, max_duration_sec, max_turns, difficulty_level,
                   tags, created_by, created_at, updated_at`,
        [
          tenantId,
          s.persona_id,
          `${s.title} (Copy)`,
          s.description,
          s.objective,
          s.opening_context,
          s.opening_message,
          JSON.stringify(s.scoring_rubric),
          s.max_duration_sec,
          s.max_turns,
          s.difficulty_level,
          s.tags,
          userId,
        ],
      );

      // Fire-and-forget audit log
      auditLog({
        tenantId,
        userId,
        action: 'scenario.duplicate',
        resourceType: 'scenario',
        resourceId: result.rows[0].id,
        details: { sourceScenarioId: scenarioId },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }),
);

export const scenarioRoutes: Router = router;

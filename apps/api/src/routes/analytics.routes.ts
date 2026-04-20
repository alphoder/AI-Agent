import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { rbac } from '../middleware/rbac';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { logger } from '../config/logger';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);
router.use(tenantMiddleware as unknown as RequestHandler);
// 60 requests per minute for analytics reads
router.use(rateLimit(60, 60));

// ---------------------------------------------------------------------------
// GET /overview — Admin dashboard overview
// ---------------------------------------------------------------------------
router.get(
  '/overview',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const tenantId = req.user!.tid;

    try {
      // Total sessions & completed sessions
      const sessionsResult = await db.tenantQuery(
        tenantId,
        `SELECT
           COUNT(*)::int AS total_sessions,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS total_completed
         FROM sessions`,
        [],
      );

      const totalSessions = sessionsResult.rows[0].total_sessions;
      const totalCompleted = sessionsResult.rows[0].total_completed;

      // Total learners (distinct users with role = learner)
      const learnersResult = await db.tenantQuery(
        tenantId,
        `SELECT COUNT(*)::int AS total_learners
         FROM users
         WHERE role = 'learner'`,
        [],
      );

      // Total active scenarios
      const scenariosResult = await db.tenantQuery(
        tenantId,
        `SELECT COUNT(*)::int AS total_scenarios
         FROM scenarios
         WHERE status = 'active'`,
        [],
      );

      // Sessions per day for last 30 days (used by the trend chart)
      const trendsResult = await db.tenantQuery(
        tenantId,
        `SELECT
           d.date::text AS date,
           COALESCE(COUNT(s.id), 0)::int AS count
         FROM generate_series(
           CURRENT_DATE - INTERVAL '29 days',
           CURRENT_DATE,
           '1 day'
         ) AS d(date)
         LEFT JOIN sessions s
           ON s.created_at::date = d.date
           AND s.tenant_id = $1
         GROUP BY d.date
         ORDER BY d.date`,
        [tenantId],
      );

      // Per-day distinct-learner counts for the last ~26 weeks
      // (used by the admin activity calendar). Includes a short array of
      // learner names per day so the hover panel can show who was active.
      const calendarDaysResult = await db.tenantQuery(
        tenantId,
        `WITH daily AS (
           SELECT s.created_at::date AS date,
                  s.user_id,
                  MAX(u.display_name) AS learner_name
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           WHERE s.tenant_id = $1
             AND s.created_at >= CURRENT_DATE - INTERVAL '182 days'
           GROUP BY s.created_at::date, s.user_id
         )
         SELECT date::text AS date,
                COUNT(DISTINCT user_id)::int AS learner_count,
                ARRAY_AGG(learner_name ORDER BY learner_name) AS learners
         FROM daily
         GROUP BY date
         ORDER BY date`,
        [tenantId],
      );

      // Open assignment due dates falling in the window
      const calendarDuesResult = await db.tenantQuery(
        tenantId,
        `SELECT sa.due_date::date::text AS date,
                sa.id AS assignment_id,
                sa.scenario_id,
                u.display_name AS learner_name,
                sc.title AS scenario_title
         FROM scenario_assignments sa
         JOIN users u ON u.id = sa.user_id
         JOIN scenarios sc ON sc.id = sa.scenario_id
         WHERE sa.tenant_id = $1
           AND sa.status != 'completed'
           AND sa.due_date IS NOT NULL
           AND sa.due_date >= CURRENT_DATE - INTERVAL '182 days'
           AND u.deleted_at IS NULL
           AND sc.deleted_at IS NULL`,
        [tenantId],
      );

      // Score distribution buckets
      const scoreDistResult = await db.tenantQuery(
        tenantId,
        `SELECT
           CASE
             WHEN ss.overall_score >= 0  AND ss.overall_score < 20  THEN '0-20'
             WHEN ss.overall_score >= 20 AND ss.overall_score < 40  THEN '20-40'
             WHEN ss.overall_score >= 40 AND ss.overall_score < 60  THEN '40-60'
             WHEN ss.overall_score >= 60 AND ss.overall_score < 80  THEN '60-80'
             WHEN ss.overall_score >= 80 AND ss.overall_score <= 100 THEN '80-100'
           END AS bucket,
           COUNT(*)::int AS count
         FROM session_scores ss
         JOIN sessions s ON s.id = ss.session_id AND s.tenant_id = $1
         WHERE ss.overall_score IS NOT NULL
         GROUP BY bucket
         ORDER BY bucket`,
        [tenantId],
      );

      // Normalise score distribution so all buckets are present
      const bucketOrder = ['0-20', '20-40', '40-60', '60-80', '80-100'];
      const bucketMap: Record<string, number> = {};
      for (const b of bucketOrder) bucketMap[b] = 0;
      for (const row of scoreDistResult.rows) {
        if (row.bucket) bucketMap[row.bucket] = row.count;
      }
      const scoreDistribution = bucketOrder.map((b) => ({ bucket: b, count: bucketMap[b] }));

      // Recent sessions (last 10)
      const recentResult = await db.tenantQuery(
        tenantId,
        `SELECT s.id, s.status, s.duration_sec, s.created_at,
                u.display_name as learner_name,
                sc.title as scenario_title,
                ss.overall_score
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         JOIN scenarios sc ON sc.id = s.scenario_id
         LEFT JOIN session_scores ss ON ss.session_id = s.id
         ORDER BY s.created_at DESC
         LIMIT 10`,
        [],
      );

      const completionRate =
        totalSessions > 0
          ? Math.round((totalCompleted / totalSessions) * 10000) / 100
          : 0;

      return res.json({
        success: true,
        data: {
          totals: {
            total_sessions: totalSessions,
            completed_sessions: totalCompleted,
            total_learners: learnersResult.rows[0].total_learners,
            active_scenarios: scenariosResult.rows[0].total_scenarios,
          },
          trends: trendsResult.rows,
          completion_rate: completionRate,
          score_distribution: scoreDistribution.map((b) => ({ range: b.bucket, count: b.count })),
          recent_sessions: recentResult.rows,
          calendar: {
            days: calendarDaysResult.rows,
            dues: calendarDuesResult.rows,
          },
        },
      });
    } catch (err) {
      logger.error({ err }, 'Analytics overview error');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch analytics overview' },
      });
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /my-activity — Learner's own recent sessions + upcoming assignments
// Used by the learner dashboard calendar. Scoped to the authenticated user;
// no role restriction but learners only ever see their own rows.
// ---------------------------------------------------------------------------
router.get(
  '/my-activity',
  wrap(async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const tenantId = req.user!.tid;
    const userId = req.user!.sub;
    const days = Math.min(180, Math.max(7, parseInt(req.query.days as string) || 60));

    try {
      const [sessionsResult, assignmentsResult] = await Promise.all([
        db.tenantQuery(
          tenantId,
          `SELECT s.id,
                  s.created_at,
                  s.status,
                  s.duration_sec,
                  sc.title AS scenario_title,
                  ss.overall_score
           FROM sessions s
           JOIN scenarios sc ON sc.id = s.scenario_id
           LEFT JOIN session_scores ss ON ss.session_id = s.id
           WHERE s.user_id = $1
             AND s.created_at >= NOW() - ($2::int || ' days')::interval
           ORDER BY s.created_at DESC
           LIMIT 500`,
          [userId, days],
        ),
        db.tenantQuery(
          tenantId,
          `SELECT sa.id AS assignment_id,
                  sa.scenario_id,
                  sa.due_date,
                  sa.status,
                  sc.title AS scenario_title
           FROM scenario_assignments sa
           JOIN scenarios sc ON sc.id = sa.scenario_id
           WHERE sa.user_id = $1
             AND sa.due_date IS NOT NULL
             AND sa.status != 'completed'
             AND sc.deleted_at IS NULL
           ORDER BY sa.due_date ASC
           LIMIT 100`,
          [userId],
        ),
      ]);

      res.json({
        success: true,
        data: {
          sessions: sessionsResult.rows,
          due_assignments: assignmentsResult.rows,
        },
        meta: { days, user_id: userId },
      });
    } catch (err) {
      logger.error({ err }, 'my-activity error');
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity' },
      });
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /scenarios/:id — Per-scenario analytics
// ---------------------------------------------------------------------------
router.get(
  '/scenarios/:id',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const tenantId = req.user!.tid;
    const scenarioId = req.params.id;

    try {
      // Verify scenario exists in tenant
      const scenarioCheck = await db.tenantQuery(
        tenantId,
        `SELECT id FROM scenarios WHERE id = $1`,
        [scenarioId],
      );

      if (scenarioCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Scenario not found' },
        });
      }

      // Assignment completion stats
      const completionResult = await db.tenantQuery(
        tenantId,
        `SELECT
           COUNT(*)::int AS total_assignments,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count
         FROM scenario_assignments
         WHERE scenario_id = $1`,
        [scenarioId],
      );

      const totalAssignments = completionResult.rows[0].total_assignments;
      const completedCount = completionResult.rows[0].completed_count;
      const completionRate =
        totalAssignments > 0
          ? Math.round((completedCount / totalAssignments) * 10000) / 100
          : 0;

      // Average overall score for completed sessions of this scenario
      const avgScoreResult = await db.tenantQuery(
        tenantId,
        `SELECT ROUND(AVG(ss.overall_score)::numeric, 2)::float AS avg_score
         FROM session_scores ss
         JOIN sessions s ON s.id = ss.session_id AND s.tenant_id = $1
         WHERE s.scenario_id = $2
           AND s.status = 'completed'`,
        [tenantId, scenarioId],
      );

      // Top 5 performers
      const topPerformersResult = await db.tenantQuery(
        tenantId,
        `SELECT
           u.display_name,
           u.email,
           ss.overall_score,
           s.ended_at AS completed_at
         FROM session_scores ss
         JOIN sessions s ON s.id = ss.session_id AND s.tenant_id = $1
         JOIN users u ON u.id = s.user_id AND u.tenant_id = $1
         WHERE s.scenario_id = $2
           AND s.status = 'completed'
         ORDER BY ss.overall_score DESC
         LIMIT 5`,
        [tenantId, scenarioId],
      );

      // Weakest criteria — average score per rubric criterion across all sessions
      // criteria_scores is a jsonb array of { criterion_name, score, weight, justification }
      const criteriaResult = await db.tenantQuery(
        tenantId,
        `SELECT
           c->>'criterion_name' AS criterion_name,
           ROUND(AVG((c->>'score')::numeric), 2)::float AS avg_score
         FROM session_scores ss
         JOIN sessions s ON s.id = ss.session_id AND s.tenant_id = $1
         CROSS JOIN LATERAL jsonb_array_elements(ss.criteria_scores) AS c
         WHERE s.scenario_id = $2
           AND s.status = 'completed'
         GROUP BY c->>'criterion_name'
         ORDER BY avg_score ASC`,
        [tenantId, scenarioId],
      );

      return res.json({
        success: true,
        data: {
          completion: {
            total_assignments: totalAssignments,
            completed_count: completedCount,
            completion_rate: completionRate,
          },
          avg_score: avgScoreResult.rows[0].avg_score ?? null,
          top_performers: topPerformersResult.rows,
          weakest_criteria: criteriaResult.rows,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Analytics scenario error');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch scenario analytics' },
      });
    }
  }),
);

// ---------------------------------------------------------------------------
// GET /learners/:id — Per-learner analytics
// ---------------------------------------------------------------------------
router.get(
  '/learners/:id',
  wrap(async (req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const tenantId = req.user!.tid;
    const learnerId = req.params.id;
    const isAdmin = req.user!.role === 'admin';

    // Learners can only view their own analytics; admins can view any learner
    if (!isAdmin && req.user!.sub !== learnerId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only view your own analytics' },
      });
    }

    try {
      // Verify learner exists in tenant
      const learnerCheck = await db.tenantQuery(
        tenantId,
        `SELECT id FROM users WHERE id = $1 AND role = 'learner'`,
        [learnerId],
      );

      if (learnerCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Learner not found' },
        });
      }

      // Session history with scenario title and score
      const historyResult = await db.tenantQuery(
        tenantId,
        `SELECT
           sc.title AS scenario_title,
           ss.overall_score,
           s.duration_sec,
           s.status,
           s.ended_at AS completed_at
         FROM sessions s
         LEFT JOIN scenarios sc ON sc.id = s.scenario_id AND sc.tenant_id = $1
         LEFT JOIN session_scores ss ON ss.session_id = s.id
         WHERE s.user_id = $2
           AND s.tenant_id = $1
         ORDER BY s.created_at DESC`,
        [tenantId, learnerId],
      );

      // Score trend — completed sessions ordered chronologically
      const scoreTrendResult = await db.tenantQuery(
        tenantId,
        `SELECT
           s.ended_at::date::text AS date,
           ss.overall_score AS score
         FROM sessions s
         JOIN session_scores ss ON ss.session_id = s.id
         WHERE s.user_id = $1
           AND s.tenant_id = $2
           AND s.status = 'completed'
           AND s.ended_at IS NOT NULL
         ORDER BY s.ended_at ASC`,
        [learnerId, tenantId],
      );

      // Total time spent on completed sessions
      const timeSpentResult = await db.tenantQuery(
        tenantId,
        `SELECT COALESCE(SUM(duration_sec), 0)::int AS time_spent
         FROM sessions
         WHERE user_id = $1
           AND tenant_id = $2
           AND status = 'completed'`,
        [learnerId, tenantId],
      );

      // Assignment progress
      const progressResult = await db.tenantQuery(
        tenantId,
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
           COUNT(*) FILTER (WHERE status = 'assigned')::int AS pending
         FROM scenario_assignments
         WHERE user_id = $1
           AND tenant_id = $2`,
        [learnerId, tenantId],
      );

      return res.json({
        success: true,
        data: {
          history: historyResult.rows,
          score_trend: scoreTrendResult.rows,
          time_spent: timeSpentResult.rows[0].time_spent,
          progress: progressResult.rows[0],
        },
      });
    } catch (err) {
      logger.error({ err }, 'Analytics learner error');
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch learner analytics' },
      });
    }
  }),
);

export const analyticsRoutes: Router = router;

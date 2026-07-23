import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { db } from '../config/database';
import { JOURNEY, masteryFor, Mastery } from '@avatar-platform/shared';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

interface LessonProgress {
  key: string;
  unit: string;
  scenarioId: string | null;
  title: string;
  level: string | null;
  attempts: number;
  best: number | null;
  mastery: Mastery;
  state: 'done' | 'next' | 'upcoming';
}

/**
 * GET /api/journey — the path with per-lesson progress, computed straight from
 * sessions + session_scores. ponytail: no progress tables; the truth already
 * lives in the score history, we just read it.
 */
router.get('/', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;

  const titles = JOURNEY.flatMap((u) => u.lessons.map((l) => l.scenario));
  const scenarioRows = await db.query(
    `SELECT id, title, difficulty_level FROM scenarios
     WHERE title = ANY($1) AND created_by IS NULL AND deleted_at IS NULL`,
    [titles],
  );
  const byTitle = new Map<string, { id: string; difficulty_level: string }>(
    scenarioRows.rows.map((r) => [r.title, { id: r.id, difficulty_level: r.difficulty_level }]),
  );

  // Attempts + best score per scenario for this user, one query.
  const prog = await db.query(
    `SELECT s.scenario_id, COUNT(*)::int AS attempts, MAX(sc.overall_score)::float AS best
     FROM sessions s
     LEFT JOIN session_scores sc ON sc.session_id = s.id
     WHERE s.user_id = $1 AND s.scenario_id = ANY($2)
     GROUP BY s.scenario_id`,
    [me, scenarioRows.rows.map((r) => r.id)],
  );
  const byScenario = new Map<string, { attempts: number; best: number | null }>(
    prog.rows.map((r) => [r.scenario_id, { attempts: r.attempts, best: r.best }]),
  );

  // Build units; the first not-yet-bronze lesson overall is "next" (the one action).
  let nextAssigned = false;
  const units = JOURNEY.map((u) => {
    const lessons: LessonProgress[] = u.lessons.map((l) => {
      const sc = byTitle.get(l.scenario) ?? null;
      const p = sc ? byScenario.get(sc.id) : undefined;
      const mastery = masteryFor(p?.best ?? null);
      const done = mastery !== 'none';
      let state: LessonProgress['state'] = done ? 'done' : 'upcoming';
      if (!done && !nextAssigned) { state = 'next'; nextAssigned = true; }
      return {
        key: l.key, unit: u.key,
        scenarioId: sc?.id ?? null, title: l.scenario, level: sc?.difficulty_level ?? null,
        attempts: p?.attempts ?? 0, best: p?.best ?? null, mastery, state,
      };
    });
    const doneCount = lessons.filter((l) => l.mastery !== 'none').length;
    return { key: u.key, title: u.title, drills: u.drills, do: u.do, dont: u.dont, lessons, doneCount };
  });

  const next = units.flatMap((u) => u.lessons).find((l) => l.state === 'next') ?? null;
  const firstTimer = units.every((u) => u.lessons.every((l) => l.attempts === 0));
  res.json({ success: true, data: { units, next, firstTimer } });
}));

export const journeyRoutes: Router = router;

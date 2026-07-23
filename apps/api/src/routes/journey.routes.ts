import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { db } from '../config/database';
import { callAIService } from '../utils/ai-service-client';
import { getStreak, getXp } from '../services/game-service';
import { JOURNEY, MASTERY, masteryFor, Mastery } from '@avatar-platform/shared';

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
  review?: boolean;
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

  // --- Game layer: streak + xp (computed on read), review picks, certificates. ---
  const [streak, xp] = await Promise.all([getStreak(me), getXp(me)]);

  // Spaced repetition, the lazy way: the 2 weakest attempted lessons resurface.
  const attempted = units.flatMap((u) => u.lessons).filter((l) => l.best != null && l.state !== 'next');
  attempted.sort((a, b) => (a.best ?? 0) - (b.best ?? 0));
  const reviewKeys = new Set(attempted.slice(0, 2).map((l) => l.key));
  units.forEach((u) => u.lessons.forEach((l) => { l.review = reviewKeys.has(l.key); }));

  // Certificates: a unit is certified when every lesson reaches silver. Issued
  // lazily here (idempotent insert) — no cron, no event bus.
  for (const u of units) {
    if (u.lessons.length > 0 && u.lessons.every((l) => (l.best ?? 0) >= MASTERY.silver)) {
      await db.query(
        `INSERT INTO certificates (user_id, unit_key) VALUES ($1, $2)
         ON CONFLICT ON CONSTRAINT certificates_user_unit_unique DO NOTHING`,
        [me, u.key],
      );
    }
  }
  const certs = await db.query(
    'SELECT unit_key, issued_at FROM certificates WHERE user_id = $1 ORDER BY issued_at DESC',
    [me],
  );

  res.json({ success: true, data: { units, next, firstTimer, streak, xp, certificates: certs.rows } });
}));

/**
 * POST /api/journey/drill — one turn of the FREE text drill (flash-lite; never
 * metered). Body: { scenario_id, messages: [{role:'user'|'customer', text}] }.
 */
router.post('/drill', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const { scenario_id, messages } = req.body ?? {};
  if (!scenario_id || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'scenario_id and messages required' } });
  }
  const sc = await db.query(
    `SELECT title, system_prompt FROM scenarios
     WHERE id = $1 AND deleted_at IS NULL AND (visibility = 'public' OR created_by = $2)`,
    [scenario_id, me],
  );
  if (sc.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scenario not found' } });
  }
  // The unit's technique gives the coach its lens (empty string is fine for custom scenarios).
  const unit = JOURNEY.find((u) => u.lessons.some((l) => l.scenario === sc.rows[0].title));
  try {
    const aiRes = await callAIService({
      path: '/drill/turn',
      body: {
        persona: sc.rows[0].system_prompt,
        technique: unit ? `${unit.title}: ${unit.drills}` : '',
        messages: messages.slice(-16).map((m: { role: string; text: string }) => ({
          role: m.role === 'user' ? 'user' : 'customer',
          text: String(m.text ?? '').slice(0, 1000),
        })),
      },
      timeoutMs: 25000,
    });
    res.json({ success: true, data: await aiRes.json() });
  } catch {
    res.status(502).json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'Drill unavailable right now.' } });
  }
}));

export const journeyRoutes: Router = router;

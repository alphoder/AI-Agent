import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { callAIService } from '../utils/ai-service-client';
import { getStreak, getXp } from '../services/game-service';
import { normaliseIntake, generatePlan, getPlan, plansThisMonth, PLAN_LIMIT_PER_MONTH } from '../services/plan-service';
import { JOURNEY, MASTERY, masteryFor, Mastery, type JourneyPlan } from '@avatar-platform/shared';


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
/**
 * The static curriculum with per-lesson progress, plus the learner's
 * white-label branding. Split out of GET / so the journey page (the page every
 * learner lands on) never pays for the curriculum payload it does not render.
 */
async function loadCurriculum(userId: string) {
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
    [userId, scenarioRows.rows.map((r) => r.id)],
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

  // Spaced repetition, the lazy way: the 2 weakest attempted lessons resurface.
  const attempted = units.flatMap((u) => u.lessons).filter((l) => l.best != null && l.state !== 'next');
  attempted.sort((a, b) => (a.best ?? 0) - (b.best ?? 0));
  const reviewKeys = new Set(attempted.slice(0, 2).map((l) => l.key));
  units.forEach((u) => u.lessons.forEach((l) => { l.review = reviewKeys.has(l.key); }));

  // White-label: the learner's first workspace with branding themes the academy.
  const brand = await db.query(
    `SELECT w.academy_name, w.accent_color, w.logo_url
     FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1 AND w.academy_name IS NOT NULL
     ORDER BY wm.joined_at ASC LIMIT 1`,
    [userId],
  );
  const branding = brand.rows[0] ?? { academy_name: null, accent_color: null, logo_url: null };

  return { units, branding };
}

/**
 * GET /api/journey — the slim page payload: the plan with progress, the game
 * stats, and how many plan builds the learner has left this month. The static
 * curriculum lives on GET /curriculum for the pages that actually render it.
 */
router.get('/', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const { units } = await loadCurriculum(me);

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
  const [certs, streak, xp, used] = await Promise.all([
    db.query('SELECT unit_key, issued_at FROM certificates WHERE user_id = $1 ORDER BY issued_at DESC', [me]),
    getStreak(me),
    getXp(me),
    plansThisMonth(me),
  ]);

  const plan = await getPlan(me);
  const planView = plan ? await withProgress(me, plan) : null;
  const finished = !!planView && planView.days.length > 0 && planView.days.every((d) => d.done);

  res.json({
    success: true,
    data: {
      plan: planView,
      streak,
      xp,
      certificates: certs.rows,
      finished,
      generationsLeft: Math.max(0, PLAN_LIMIT_PER_MONTH - used),
      generationsLimit: PLAN_LIMIT_PER_MONTH,
    },
  });
}));

/**
 * GET /api/journey/curriculum — the static curriculum with per-lesson progress
 * and branding, for the module / scenario-module pages. Kept off the journey
 * page's GET / so that route stays small.
 */
router.get('/curriculum', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const [curriculum, xp] = await Promise.all([loadCurriculum(me), getXp(me)]);
  res.json({ success: true, data: { units: curriculum.units, branding: curriculum.branding, xp } });
}));

/**
 * Attach per-task progress + scenario titles to a stored plan. ponytail: no task
 * progress rows — attempts per scenario already tell us everything.
 */
async function withProgress(userId: string, plan: JourneyPlan) {
  const ids = [...new Set(plan.days.flatMap((d) => d.tasks.map((t) => t.scenarioId)))];
  if (ids.length === 0) return { ...plan, days: [], currentDay: 1 };

  const [scenarios, attempts] = await Promise.all([
    db.query(
      'SELECT id, title, difficulty_level, language FROM scenarios WHERE id = ANY($1) AND deleted_at IS NULL',
      [ids],
    ),
    db.query(
      `SELECT s.scenario_id, COUNT(*)::int AS attempts, MAX(sc.overall_score)::float AS best
         FROM sessions s
         LEFT JOIN session_scores sc ON sc.session_id = s.id
        WHERE s.user_id = $1 AND s.scenario_id = ANY($2)
        GROUP BY s.scenario_id`,
      [userId, ids],
    ),
  ]);
  const meta = new Map(scenarios.rows.map((r) => [r.id, r]));
  const stat = new Map(attempts.rows.map((r) => [r.scenario_id, r]));

  const days = plan.days.map((d) => {
    const tasks = d.tasks.map((t) => {
      const s = stat.get(t.scenarioId);
      const n = s?.attempts ?? 0;
      // A review only counts once they have come BACK to the scenario.
      const done = t.type === 'review' ? n >= 2 : n >= 1;
      const m = meta.get(t.scenarioId);
      return {
        ...t,
        title: m?.title ?? 'Scenario',
        level: m?.difficulty_level ?? null,
        language: m?.language ?? 'en',
        attempts: n,
        best: s?.best ?? null,
        mastery: masteryFor(s?.best ?? null),
        done,
        // A scenario that vanished from the library must not strand the day.
        missing: !m,
      };
    });
    return { ...d, tasks, done: tasks.every((t) => t.done || t.missing) };
  });

  const currentDay = days.find((d) => !d.done)?.day ?? days[days.length - 1]?.day ?? 1;
  const finished = days.length > 0 && days.every((d) => d.done);
  return { headline: plan.headline, days, currentDay, kind: plan.kind, finished };
}

/**
 * POST /api/journey/intake — save the questionnaire and build the plan.
 * Synchronous by design: the user is watching a "building your path" screen and
 * the plan IS the payoff. Rate limited because it costs a Gemini call.
 */
router.post('/intake', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const intake = normaliseIntake(req.body);
  if (intake.outcomes.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'Pick at least one goal.' } });
  }
  if (await plansThisMonth(me) >= PLAN_LIMIT_PER_MONTH) {
    return res.status(429).json({ success: false, error: { code: 'PLAN_LIMIT', message: `You can build ${PLAN_LIMIT_PER_MONTH} plans a month. Your next one unlocks next month.` } });
  }

  // org/city/state also land in metadata.profile: that is what the competition
  // boards scope on, and what My Profile edits. The intake is the answer sheet;
  // the profile is the live value.
  const profile = { org: intake.org, city: intake.city, state: intake.state };
  const user = await db.query(
    `UPDATE users
        SET metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object('intake', $2::jsonb)
              || jsonb_build_object('profile', COALESCE(metadata->'profile', '{}'::jsonb) || $3::jsonb),
            updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING name`,
    [me, JSON.stringify(intake), JSON.stringify(profile)],
  );
  if (user.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }

  try {
    const plan = await generatePlan(me, intake, user.rows[0].name ?? '');
    const used = await plansThisMonth(me);
    res.json({ success: true, data: { plan: await withProgress(me, plan), generationsLeft: Math.max(0, PLAN_LIMIT_PER_MONTH - used) } });
  } catch (err) {
    logger.error({ err, userId: me }, 'plan generation failed');
    res.status(502).json({ success: false, error: { code: 'PLAN_FAILED', message: 'Could not build your plan. Your answers are saved, please try again.' } });
  }
}));

/** POST /api/journey/plan/refresh — rebuild from the saved intake, no re-asking. */
router.post('/plan/refresh', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  if (await plansThisMonth(me) >= PLAN_LIMIT_PER_MONTH) {
    return res.status(429).json({ success: false, error: { code: 'PLAN_LIMIT', message: `You can build ${PLAN_LIMIT_PER_MONTH} plans a month. Your next one unlocks next month.` } });
  }
  const row = await db.query(
    "SELECT name, metadata->'intake' AS intake FROM users WHERE id = $1 AND deleted_at IS NULL",
    [me],
  );
  const saved = row.rows[0]?.intake;
  if (!saved) {
    return res.status(400).json({ success: false, error: { code: 'NO_INTAKE', message: 'Answer the questions first.' } });
  }
  try {
    const plan = await generatePlan(me, normaliseIntake(saved), row.rows[0].name ?? '');
    const used = await plansThisMonth(me);
    res.json({ success: true, data: { plan: await withProgress(me, plan), generationsLeft: Math.max(0, PLAN_LIMIT_PER_MONTH - used) } });
  } catch (err) {
    logger.error({ err, userId: me }, 'plan refresh failed');
    res.status(502).json({ success: false, error: { code: 'PLAN_FAILED', message: 'Could not rebuild your plan right now.' } });
  }
}));

/**
 * POST /api/journey/extend — the free continuation.
 *
 * Once the learner finishes the WHOLE current plan (every task done), the next
 * journey is generated with passed scenarios excluded (best score >= 50), so
 * nothing they have mastered gets re-trained. Free by design: the monthly cap
 * covers manual builds/rebuilds only — this is the product's retention loop,
 * not a rewrite button, so it does not consume the learner's monthly budget.
 */
router.post('/extend', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const row = await db.query(
    "SELECT name, metadata->'intake' AS intake FROM users WHERE id = $1 AND deleted_at IS NULL",
    [me],
  );
  const saved = row.rows[0]?.intake;
  if (!saved) {
    return res.status(400).json({ success: false, error: { code: 'NO_INTAKE', message: 'Answer the questions first.' } });
  }
  const plan = await getPlan(me);
  if (!plan) {
    return res.status(400).json({ success: false, error: { code: 'NO_PLAN', message: 'Build your first plan before extending it.' } });
  }
  const view = await withProgress(me, plan);
  if (view.days.length === 0 || !view.days.every((d) => d.done)) {
    return res.status(400).json({ success: false, error: { code: 'PLAN_NOT_FINISHED', message: 'Finish your current journey first.' } });
  }
  try {
    const extended = await generatePlan(me, normaliseIntake(saved), row.rows[0].name ?? '', { kind: 'extended' });
    res.json({ success: true, data: { plan: await withProgress(me, extended) } });
  } catch (err) {
    logger.error({ err, userId: me }, 'journey extension failed');
    res.status(502).json({ success: false, error: { code: 'PLAN_FAILED', message: 'Could not prepare your extended journey right now.' } });
  }
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

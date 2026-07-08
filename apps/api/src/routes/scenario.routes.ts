import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { validateUuidParam } from '../middleware/validate-uuid';
import { callAIService } from '../utils/ai-service-client';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);
router.use(rateLimit(60, 60));

// Gemini Live prebuilt voices.
const VOICES = new Set(['Aoede', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Zephyr']);
const DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);

function validateRubric(rubric: any[]): string | null {
  if (!rubric || (Array.isArray(rubric) && rubric.length === 0)) return null;
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
      if (scores.has(level.score)) return `Duplicate score ${level.score} in criterion "${criterion.name}"`;
      scores.add(level.score);
      if (!level.label?.trim()) return `Each level must have a label in criterion "${criterion.name}"`;
      if (!level.description?.trim()) return `Each level must have a description in criterion "${criterion.name}"`;
    }
  }
  if (totalWeight !== 100) return `Rubric weights must sum to 100 (current: ${totalWeight})`;
  return null;
}

const SELECT_COLS = `id, title, description, objective, system_prompt, opening_message,
  language, voice, scoring_rubric, status, visibility, max_duration_sec, max_turns,
  difficulty_level, tags, created_by, created_at, updated_at`;

/**
 * GET /api/scenarios — public library + the caller's own scenarios.
 * Query: q (search), difficulty, mine=true, page, limit.
 */
router.get('/', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit || '30'), 10) || 30));
  const offset = (page - 1) * limit;

  const where: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (req.query.mine === 'true') {
    params.push(me);
    where.push(`created_by = $${params.length}`);
  } else {
    params.push(me);
    where.push(`(visibility = 'public' OR created_by = $${params.length})`);
  }
  if (req.query.difficulty && DIFFICULTIES.has(String(req.query.difficulty))) {
    params.push(req.query.difficulty);
    where.push(`difficulty_level = $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${String(req.query.q).toLowerCase()}%`);
    where.push(`(LOWER(title) LIKE $${params.length} OR LOWER(COALESCE(description,'')) LIKE $${params.length})`);
  }
  // tags=a,b,c — match scenarios carrying ANY of these tags (overlap). Powers
  // goal-based recommendations from the onboarding questionnaire.
  if (req.query.tags) {
    const tagList = String(req.query.tags)
      .split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    if (tagList.length) {
      params.push(tagList);
      where.push(`tags && $${params.length}::text[]`);
    }
  }
  const whereSql = where.join(' AND ');

  const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM scenarios WHERE ${whereSql}`, params);
  params.push(limit, offset);
  const result = await db.query(
    `SELECT ${SELECT_COLS}, (created_by = $1) AS is_owner
     FROM scenarios WHERE ${whereSql}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const total = countResult.rows[0].total;
  res.json({
    success: true,
    data: result.rows,
    meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
}));

/**
 * GET /api/scenarios/:id — public or owned.
 */
router.get('/:id', validateUuidParam('id'), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const result = await db.query(
    `SELECT ${SELECT_COLS}, (created_by = $2) AS is_owner FROM scenarios
     WHERE id = $1 AND deleted_at IS NULL AND (visibility = 'public' OR created_by = $2)`,
    [req.params.id, me],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scenario not found' } });
  }
  res.json({ success: true, data: result.rows[0] });
}));

function validatePayload(body: any): string | null {
  if (!body.title?.trim()) return 'Title is required';
  if (!body.objective?.trim()) return 'Objective is required';
  if (!body.system_prompt?.trim()) return 'A character / system prompt is required';
  if (body.voice && !VOICES.has(body.voice)) return `Voice must be one of: ${[...VOICES].join(', ')}`;
  if (body.difficulty_level && !DIFFICULTIES.has(body.difficulty_level)) return 'Invalid difficulty level';
  if (body.visibility && !['public', 'private'].includes(body.visibility)) return 'Invalid visibility';
  return validateRubric(body.scoring_rubric);
}

/**
 * POST /api/scenarios — create (owned by caller).
 */
router.post('/', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const err = validatePayload(req.body);
  if (err) return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: err } });

  const b = req.body;
  const result = await db.query(
    `INSERT INTO scenarios (
       title, description, objective, system_prompt, opening_message, language, voice,
       scoring_rubric, status, visibility, max_duration_sec, max_turns, difficulty_level, tags, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'active',$9,$10,$11,$12,$13,$14)
     RETURNING ${SELECT_COLS}`,
    [
      b.title.trim(), b.description || null, b.objective.trim(), b.system_prompt.trim(),
      b.opening_message || null, b.language || 'en', b.voice || 'Aoede',
      JSON.stringify(b.scoring_rubric), b.visibility || 'private',
      b.max_duration_sec || 600, b.max_turns || 40, b.difficulty_level || 'intermediate',
      Array.isArray(b.tags) ? b.tags : [], me,
    ],
  );
  logger.info({ scenarioId: result.rows[0].id, userId: me }, 'Scenario created');
  res.status(201).json({ success: true, data: result.rows[0] });
}));

/**
 * PATCH /api/scenarios/:id — update (owner only).
 */
router.patch('/:id', validateUuidParam('id'), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const owned = await db.query('SELECT id FROM scenarios WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL', [req.params.id, me]);
  if (owned.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scenario not found or not yours' } });
  }
  if (req.body.scoring_rubric !== undefined) {
    const rErr = validateRubric(req.body.scoring_rubric);
    if (rErr) return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: rErr } });
  }
  if (req.body.voice && !VOICES.has(req.body.voice)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'Invalid voice' } });
  }

  const allowed: Record<string, string> = {
    title: 'title', description: 'description', objective: 'objective', system_prompt: 'system_prompt',
    opening_message: 'opening_message', language: 'language', voice: 'voice', visibility: 'visibility',
    max_duration_sec: 'max_duration_sec', max_turns: 'max_turns', difficulty_level: 'difficulty_level',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(allowed)) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (req.body.scoring_rubric !== undefined) {
    params.push(JSON.stringify(req.body.scoring_rubric));
    sets.push(`scoring_rubric = $${params.length}::jsonb`);
  }
  if (req.body.tags !== undefined) {
    params.push(Array.isArray(req.body.tags) ? req.body.tags : []);
    sets.push(`tags = $${params.length}`);
  }
  if (sets.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'No fields to update' } });
  }
  params.push(req.params.id);
  const result = await db.query(
    `UPDATE scenarios SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING ${SELECT_COLS}`,
    params,
  );
  res.json({ success: true, data: result.rows[0] });
}));

/**
 * DELETE /api/scenarios/:id — soft delete (owner only).
 */
router.delete('/:id', validateUuidParam('id'), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const result = await db.query(
    'UPDATE scenarios SET deleted_at = NOW() WHERE id = $1 AND created_by = $2 AND deleted_at IS NULL RETURNING id',
    [req.params.id, me],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scenario not found or not yours' } });
  }
  res.json({ success: true, data: { id: result.rows[0].id } });
}));

/**
 * POST /api/scenarios/:id/duplicate — copy a public/owned scenario into a private draft.
 */
router.post('/:id/duplicate', validateUuidParam('id'), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const src = await db.query(
    `SELECT * FROM scenarios WHERE id = $1 AND deleted_at IS NULL AND (visibility = 'public' OR created_by = $2)`,
    [req.params.id, me],
  );
  if (src.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scenario not found' } });
  }
  const s = src.rows[0];
  const result = await db.query(
    `INSERT INTO scenarios (
       title, description, objective, system_prompt, opening_message, language, voice,
       scoring_rubric, status, visibility, max_duration_sec, max_turns, difficulty_level, tags, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'active','private',$9,$10,$11,$12,$13)
     RETURNING ${SELECT_COLS}`,
    [
      `${s.title} (copy)`, s.description, s.objective, s.system_prompt, s.opening_message, s.language, s.voice,
      JSON.stringify(s.scoring_rubric), s.max_duration_sec, s.max_turns, s.difficulty_level, s.tags, me,
    ],
  );
  res.status(201).json({ success: true, data: result.rows[0] });
}));

/**
 * POST /api/scenarios/improve-prompt — redesign the user's rough prompt into an
 * optimised agent prompt (Gemini Flash Lite, key 2, server-side via AI service).
 */
router.post('/improve-prompt', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'prompt is required' } });
  }
  try {
    const aiRes = await callAIService({
      path: '/prompt/improve',
      body: { prompt: prompt.slice(0, 4000), context: typeof req.body?.context === 'string' ? req.body.context.slice(0, 1000) : undefined },
      timeoutMs: 30000,
    });
    const data = (await aiRes.json()) as { improved?: string };
    res.json({ success: true, data: { improved: data.improved } });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'improve-prompt failed');
    res.status(502).json({ success: false, error: { code: 'AI_UNAVAILABLE', message: 'Could not improve the prompt right now.' } });
  }
}));

export const scenarioRoutes: Router = router;

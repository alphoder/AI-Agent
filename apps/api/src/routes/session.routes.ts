import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { validateUuidParam } from '../middleware/validate-uuid';
import { aiServiceWsUrl, callAIServiceBackground } from '../utils/ai-service-client';
import { buildSystemPrompt } from '../utils/prompt-bundle';
import { signWsTicket } from '../utils/ws-ticket';
import { languageName, VOICE_IDS, accentLabel } from '@avatar-platform/shared';
import { ensureWallet, adjustWallet, walletEnforced } from '../services/wallet-service';

const MIN_REPORT_SEC = 90; // sessions shorter than 1m30s aren't scored

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);
router.use(rateLimit(60, 60));

/**
 * GET /api/sessions/leaderboard — weekly practice leaderboard of all users.
 */
router.get('/leaderboard', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const result = await db.query(
    `SELECT u.name, COALESCE(SUM(s.duration_sec)/60, 0)::int AS minutes, (u.id = $1) AS is_current_user
     FROM users u
     LEFT JOIN sessions s ON s.user_id = u.id AND s.status = 'completed' AND s.ended_at >= NOW() - INTERVAL '7 days'
     WHERE u.deleted_at IS NULL
     GROUP BY u.id, u.name
     ORDER BY minutes DESC
     LIMIT 10`,
    [me],
  );
  res.json({ success: true, data: result.rows });
}));

/**
 * GET /api/sessions — the caller's recent sessions (history).
 */
router.get('/', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const result = await db.query(
    `SELECT s.id, s.scenario_id, s.status, s.language, s.started_at, s.ended_at,
            s.duration_sec, sc.title AS scenario_title,
            ss.overall_score, ss.body_language_score
     FROM sessions s
     JOIN scenarios sc ON sc.id = s.scenario_id
     LEFT JOIN session_scores ss ON ss.session_id = s.id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC
     LIMIT 50`,
    [me],
  );
  res.json({ success: true, data: result.rows });
}));

/**
 * POST /api/sessions — start a voice session for a scenario.
 * Body: { scenario_id, language? }. Returns the WS URL + everything the browser
 * needs to drive Gemini Live (system prompt, voice, language).
 */
router.post('/', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const { scenario_id, language, voice, accent, locality } = req.body;
  if (!scenario_id) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'scenario_id required' } });
  }
  // Accent = a BCP-47 regional code (e.g. en-IN); locality = free text region.
  const accentCode = typeof accent === 'string' && /^[a-z]{2}-[A-Za-z]{2,3}$/.test(accent) ? accent : null;
  const localityText = typeof locality === 'string' ? locality.trim().slice(0, 60) || null : null;

  const scenarioResult = await db.query(
    `SELECT id, title, description, objective, system_prompt, opening_message, language, voice,
            max_duration_sec, max_turns, difficulty_level
     FROM scenarios
     WHERE id = $1 AND deleted_at IS NULL AND (visibility = 'public' OR created_by = $2)`,
    [scenario_id, me],
  );
  if (scenarioResult.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Scenario not found' } });
  }
  const sc = scenarioResult.rows[0];
  const sessionLanguage = (language || sc.language || 'en').slice(0, 10);
  const sessionVoice = VOICE_IDS.includes(voice) ? voice : sc.voice; // user override, else scenario default

  // Wallet: created on first touch (starter minutes). Blocks/caps ONLY when
  // WALLET_ENFORCE=true — during beta everyone is effectively unlimited, but
  // usage is still metered so we learn real burn.
  const balance = await ensureWallet(me);
  if (walletEnforced() && balance <= 0) {
    return res.status(402).json({ success: false, error: { code: 'NO_MINUTES', message: 'You are out of practice minutes. Top up to start a call.' } });
  }
  // Mid-call enforcement for free: the client already auto-ends at maxDurationSec,
  // so capping it by the remaining balance IS the meter.
  const maxDuration = walletEnforced() ? Math.max(60, Math.min(sc.max_duration_sec, balance)) : sc.max_duration_sec;

  const sessionResult = await db.query(
    `INSERT INTO sessions (user_id, scenario_id, language, status, started_at)
     VALUES ($1, $2, $3, 'active', NOW())
     RETURNING id`,
    [me, scenario_id, sessionLanguage],
  );
  const sessionId = sessionResult.rows[0].id;

  // First name of the agent — used only when the persona already knows them.
  const meRow = await db.query('SELECT name FROM users WHERE id = $1', [me]);
  const learnerName = (meRow.rows[0]?.name || '').trim().split(/\s+/)[0] || null;

  const systemPrompt = buildSystemPrompt({
    ...sc,
    language: sessionLanguage,
    language_name: languageName(sessionLanguage),
    learner_name: learnerName,
    accent_label: accentCode ? accentLabel(accentCode) : null,
    locality: localityText,
  });
  // Short-lived signed ticket — the AI service rejects any socket without it.
  const ticket = signWsTicket(sessionId, me);
  // The relay uses `lang` as Gemini's language_code — pass the full accent code
  // (e.g. en-IN) when chosen, else the plain language (relay maps it to a default region).
  const wsLang = accentCode || sessionLanguage;
  const wsUrl = `${aiServiceWsUrl('/ws/session')}?ticket=${encodeURIComponent(ticket)}&lang=${encodeURIComponent(wsLang)}`;

  logger.info({ sessionId, scenario_id, userId: me }, 'Session started');
  res.status(201).json({
    success: true,
    data: {
      sessionId,
      wsUrl,
      sessionConfig: {
        scenarioTitle: sc.title,
        systemPrompt,
        openingMessage: sc.opening_message,
        voice: sessionVoice,
        language: sessionLanguage,
        maxDurationSec: maxDuration,
        maxTurns: sc.max_turns,
      },
    },
  });
}));

/**
 * POST /api/sessions/:id/end — end the session and trigger async scoring.
 */
router.post('/:id/end', validateUuidParam('id'), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const result = await db.query(
    `UPDATE sessions
     SET status = 'completed', ended_at = NOW(),
         duration_sec = EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, created_at)))::int,
         updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status != 'completed'
     RETURNING id, scenario_id, language, body_language_notes, duration_sec`,
    [req.params.id, me],
  );
  if (result.rows.length === 0) {
    return res.json({ success: true, data: { id: req.params.id, alreadyEnded: true } });
  }
  const session = result.rows[0];

  // Meter the call: every ended session debits its duration from the wallet
  // (recorded even in beta, so the ledger shows real usage).
  if ((session.duration_sec ?? 0) > 0) {
    await adjustWallet(me, -session.duration_sec, 'call', session.id);
  }

  // Only score sessions long enough to be meaningful (>= 90s).
  const scored = (session.duration_sec ?? 0) >= MIN_REPORT_SEC;
  if (scored) {
    const sc = await db.query(
      'SELECT objective, system_prompt, scoring_rubric, difficulty_level FROM scenarios WHERE id = $1',
      [session.scenario_id],
    );
    const scenario = sc.rows[0];

    // Fire-and-forget scoring (Gemini). The AI service fetches the transcript and
    // persists the score back via the internal API.
    callAIServiceBackground({
      path: '/scoring/evaluate',
      body: {
        session_id: session.id,
        rubric: scenario?.scoring_rubric ?? [],
        persona_context: scenario?.system_prompt ?? '',
        scenario_objective: scenario?.objective ?? '',
        language: session.language,
        body_language_notes: session.body_language_notes ?? [],
        difficulty_level: scenario?.difficulty_level ?? 'intermediate',
      },
    });
  }

  res.json({ success: true, data: { id: session.id, scored, durationSec: session.duration_sec, minReportSec: MIN_REPORT_SEC } });
}));

/**
 * GET /api/sessions/:id — session detail (owner only).
 */
router.get('/:id', validateUuidParam('id'), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const result = await db.query(
    `SELECT s.id, s.scenario_id, s.language, s.status, s.started_at, s.ended_at,
            s.duration_sec, s.total_turns, sc.title AS scenario_title
     FROM sessions s JOIN scenarios sc ON sc.id = s.scenario_id
     WHERE s.id = $1 AND s.user_id = $2`,
    [req.params.id, me],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
  }
  res.json({ success: true, data: result.rows[0] });
}));

/**
 * GET /api/sessions/:id/transcript — ordered transcript (owner only).
 */
router.get('/:id/transcript', validateUuidParam('id'), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const owns = await db.query('SELECT 1 FROM sessions WHERE id = $1 AND user_id = $2', [req.params.id, me]);
  if (owns.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
  }
  const result = await db.query(
    `SELECT turn_number, role, content, created_at FROM session_transcripts
     WHERE session_id = $1 ORDER BY turn_number ASC, created_at ASC`,
    [req.params.id],
  );
  res.json({ success: true, data: result.rows });
}));

/**
 * GET /api/sessions/:id/report — score + feedback (owner only). 404 until scored.
 */
router.get('/:id/report', validateUuidParam('id'), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const result = await db.query(
    `SELECT sc.overall_score, sc.criteria_scores, sc.strengths, sc.improvements,
            sc.narrative_feedback, sc.body_language_score, sc.body_language_feedback,
            sc.scored_by_model, sc.created_at AS scored_at
     FROM session_scores sc
     JOIN sessions s ON s.id = sc.session_id
     WHERE sc.session_id = $1 AND s.user_id = $2`,
    [req.params.id, me],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'NOT_READY', message: 'Report not ready yet' } });
  }
  res.json({ success: true, data: result.rows[0] });
}));

export const sessionRoutes: Router = router;

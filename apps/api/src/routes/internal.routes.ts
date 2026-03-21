import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { config } from '../config/env';

const router: Router = Router();

/**
 * Middleware: verify X-Internal-Key for all internal routes (no JWT auth).
 */
const requireInternalKey: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const internalKey = req.get('X-Internal-Key');
  if (!config.INTERNAL_API_KEY || internalKey !== config.INTERNAL_API_KEY) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or missing internal key' },
    });
    return;
  }
  next();
};

router.use(requireInternalKey);

/**
 * POST /api/internal/transcripts — Persist transcript turn from AI service
 *
 * Called by the AI service orchestrator after each conversation turn.
 * Inserts learner and/or avatar transcript rows and updates session total_turns.
 */
router.post('/transcripts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { session_id, turn_number, learner_content, avatar_content, stt_confidence, latency } = req.body;

    if (!session_id || turn_number == null) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BODY', message: 'session_id and turn_number required' },
      });
    }

    // Look up session to get tenant_id
    const sessionResult = await db.query(
      'SELECT tenant_id FROM sessions WHERE id = $1',
      [session_id],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }

    const tenantId = sessionResult.rows[0].tenant_id;

    // Insert learner transcript
    if (learner_content) {
      await db.tenantQuery(tenantId,
        `INSERT INTO session_transcripts (session_id, turn_number, role, content, created_at)
         VALUES ($1, $2, 'learner', $3, NOW())
         ON CONFLICT DO NOTHING`,
        [session_id, turn_number, learner_content],
      );
    }

    // Insert avatar transcript
    if (avatar_content) {
      await db.tenantQuery(tenantId,
        `INSERT INTO session_transcripts (session_id, turn_number, role, content, created_at)
         VALUES ($1, $2, 'avatar', $3, NOW())
         ON CONFLICT DO NOTHING`,
        [session_id, turn_number, avatar_content],
      );
    }

    // Update session total_turns
    await db.tenantQuery(tenantId,
      'UPDATE sessions SET total_turns = GREATEST(COALESCE(total_turns, 0), $1) WHERE id = $2',
      [turn_number, session_id],
    );

    logger.info({ session_id, turn_number }, 'Transcript persisted');

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/internal/sessions/:id/transcript — Fetch transcript for scoring
 *
 * Called by the AI scoring service after session ends.
 */
router.get('/sessions/:id/transcript', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.id;

    // Look up session to get tenant_id
    const sessionResult = await db.query(
      'SELECT tenant_id FROM sessions WHERE id = $1',
      [sessionId],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }

    const tenantId = sessionResult.rows[0].tenant_id;

    const result = await db.tenantQuery(tenantId,
      `SELECT st.id, st.session_id, st.turn_number, st.role, st.content,
              st.audio_url, st.duration_ms, st.sentiment, st.created_at
       FROM session_transcripts st
       WHERE st.session_id = $1
       ORDER BY st.turn_number ASC, st.created_at ASC`,
      [sessionId],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/internal/sessions/:id/score — Save score from AI scoring service
 */
router.post('/sessions/:id/score', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.id;
    const {
      tenant_id,
      overall_score,
      criteria_scores,
      strengths,
      improvements,
      narrative_feedback,
      scored_by_model,
    } = req.body;

    if (overall_score == null || !criteria_scores || !scored_by_model) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BODY', message: 'Missing required scoring fields' },
      });
    }

    const tenantId = tenant_id || (await db.query('SELECT tenant_id FROM sessions WHERE id = $1', [sessionId])).rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }

    const result = await db.tenantQuery(tenantId,
      `INSERT INTO session_scores (session_id, overall_score, criteria_scores, strengths, improvements, narrative_feedback, scored_by_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (session_id) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         criteria_scores = EXCLUDED.criteria_scores,
         strengths = EXCLUDED.strengths,
         improvements = EXCLUDED.improvements,
         narrative_feedback = EXCLUDED.narrative_feedback,
         scored_by_model = EXCLUDED.scored_by_model
       RETURNING id`,
      [
        sessionId,
        overall_score,
        JSON.stringify(criteria_scores),
        strengths || [],
        improvements || [],
        narrative_feedback || null,
        scored_by_model,
      ],
    );

    logger.info({ sessionId, overall_score, scored_by_model }, 'Session score saved (internal)');

    res.status(201).json({
      success: true,
      data: { id: result.rows[0].id, session_id: sessionId },
    });
  } catch (err) {
    next(err);
  }
});

export const internalRoutes: Router = router;

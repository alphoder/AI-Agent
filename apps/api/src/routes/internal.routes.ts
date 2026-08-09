import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { config } from '../config/env';

const router: Router = Router();

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/** Verify X-Internal-Key for all internal (service-to-service) routes. */
const requireInternalKey: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const internalKey = req.get('X-Internal-Key') || '';
  if (!config.INTERNAL_API_KEY || !timingSafeEqualStr(internalKey, config.INTERNAL_API_KEY)) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing internal key' } });
    return;
  }
  next();
};

router.use(requireInternalKey);

/**
 * POST /api/internal/transcripts — persist a conversation turn from the AI relay.
 * Body: { session_id, turn_number, learner_content?, coach_content?, stt_confidence? }
 */
router.post('/transcripts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { session_id, turn_number, learner_content, coach_content, system_content, stt_confidence } = req.body;
    if (!session_id || turn_number == null) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'session_id and turn_number required' } });
    }

    const exists = await db.query('SELECT 1 FROM sessions WHERE id = $1', [session_id]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }

    if (learner_content) {
      await db.query(
        `INSERT INTO session_transcripts (session_id, turn_number, role, content, stt_confidence)
         VALUES ($1, $2, 'learner', $3, $4)`,
        [session_id, turn_number, learner_content, stt_confidence ?? null],
      );
    }
    if (coach_content) {
      await db.query(
        `INSERT INTO session_transcripts (session_id, turn_number, role, content)
         VALUES ($1, $2, 'avatar', $3)`,
        [session_id, turn_number, coach_content],
      );
    }
    if (system_content) {
      // e.g. "[Customer ended the call: no reason to stay]" — a scored signal for the report.
      await db.query(
        `INSERT INTO session_transcripts (session_id, turn_number, role, content)
         VALUES ($1, $2, 'system', $3)`,
        [session_id, turn_number, system_content],
      );
    }
    await db.query(
      'UPDATE sessions SET total_turns = GREATEST(COALESCE(total_turns, 0), $1), updated_at = NOW() WHERE id = $2',
      [turn_number, session_id],
    );

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/internal/sessions/:id/body-language — append a body-language note.
 * Body: { at: number (sec into session), note: string }. Text only, no video.
 */
router.post('/sessions/:id/body-language', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.id;
    const { at, note } = req.body;
    if (typeof note !== 'string' || !note.trim()) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'note required' } });
    }
    const entry = JSON.stringify([{ at: typeof at === 'number' ? at : 0, note: note.slice(0, 280) }]);
    // Cap at 60 notes to keep the JSONB small.
    const result = await db.query(
      `UPDATE sessions
       SET body_language_notes = (
             CASE WHEN jsonb_array_length(body_language_notes) >= 60
                  THEN body_language_notes
                  ELSE body_language_notes || $2::jsonb END
           ),
           updated_at = NOW()
       WHERE id = $1
       RETURNING jsonb_array_length(body_language_notes) AS count`,
      [sessionId, entry],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }
    res.json({ success: true, data: { count: result.rows[0].count } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/internal/sessions/:id/transcript — ordered transcript for scoring.
 */
router.get('/sessions/:id/transcript', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `SELECT id, session_id, turn_number, role, content, stt_confidence, created_at
       FROM session_transcripts WHERE session_id = $1
       ORDER BY turn_number ASC, created_at ASC`,
      [req.params.id],
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/internal/assistant/memory — append Bixy conversation turns to the
 * user's 24-hour memory. Body: { user_id, entries: [{ role: 'user'|'assistant', text }] }.
 * Expired rows are purged first; per-user rows are capped to the newest 300.
 */
router.post('/assistant/memory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, entries } = req.body;
    if (!user_id || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'user_id and entries required' } });
    }
    // TTL: anything older than 24h is gone before we write or read.
    await db.query('DELETE FROM assistant_memory WHERE user_id = $1 AND expires_at <= NOW()', [user_id]);

    let inserted = 0;
    for (const e of entries) {
      const role = e?.role === 'assistant' ? 'assistant' : 'user';
      const text = typeof e?.text === 'string' ? e.text.trim().slice(0, 4000) : '';
      if (!text) continue;
      await db.query(
        'INSERT INTO assistant_memory (user_id, role, text) VALUES ($1, $2, $3)',
        [user_id, role, text],
      );
      inserted++;
    }
    // Hygiene cap — memory is short-term by design; keep the newest 300 rows.
    await db.query(
      `DELETE FROM assistant_memory
       WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM assistant_memory WHERE user_id = $1 ORDER BY created_at DESC LIMIT 300
       )`,
      [user_id],
    );

    res.status(201).json({ success: true, data: { inserted } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/internal/assistant/memory — recall Bixy's 24-hour memory for a user.
 * Query: { user_id, q?, limit? } — q does a loose word match over the text;
 * without q the newest rows are returned. Newest first, capped at 60.
 */
router.get('/assistant/memory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.query.user_id ?? '');
    if (!userId) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_QUERY', message: 'user_id required' } });
    }
    await db.query('DELETE FROM assistant_memory WHERE user_id = $1 AND expires_at <= NOW()', [userId]);

    const q = String(req.query.q ?? '').trim().slice(0, 120);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '30'), 10) || 30, 1), 60);
    let rows: { role: string; text: string; created_at: Date }[] = [];

    if (q) {
      const words = q.split(/\s+/).filter(Boolean).slice(0, 6).map((w) => w.replace(/[%_]/g, ''));
      if (words.length > 0) {
        const cond = words.map((_, i) => `text ILIKE '%' || $${i + 2} || '%'`).join(' OR ');
        const r = await db.query(
          `SELECT role, text, created_at FROM assistant_memory
           WHERE user_id = $1 AND (${cond})
           ORDER BY created_at DESC LIMIT $${words.length + 2}`,
          [userId, ...words, limit],
        );
        rows = r.rows;
      }
    } else {
      const r = await db.query(
        `SELECT role, text, created_at FROM assistant_memory
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [userId, limit],
      );
      rows = r.rows;
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/internal/sessions/:id/score — save a score from the AI scorer.
 */
router.post('/sessions/:id/score', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.id;
    const {
      overall_score, criteria_scores, strengths, improvements,
      narrative_feedback, body_language_score, body_language_feedback, scored_by_model,
    } = req.body;

    if (overall_score == null || !criteria_scores || !scored_by_model) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: 'Missing required scoring fields' } });
    }

    const result = await db.query(
      `INSERT INTO session_scores (
         session_id, overall_score, criteria_scores, strengths, improvements,
         narrative_feedback, body_language_score, body_language_feedback, scored_by_model
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (session_id) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         criteria_scores = EXCLUDED.criteria_scores,
         strengths = EXCLUDED.strengths,
         improvements = EXCLUDED.improvements,
         narrative_feedback = EXCLUDED.narrative_feedback,
         body_language_score = EXCLUDED.body_language_score,
         body_language_feedback = EXCLUDED.body_language_feedback,
         scored_by_model = EXCLUDED.scored_by_model
       RETURNING id`,
      [
        sessionId, overall_score, JSON.stringify(criteria_scores), strengths || [], improvements || [],
        narrative_feedback || null, body_language_score ?? null, body_language_feedback || null, scored_by_model,
      ],
    );

    logger.info({ sessionId, overall_score, scored_by_model }, 'Session score saved (internal)');
    res.status(201).json({ success: true, data: { id: result.rows[0].id, session_id: sessionId } });
  } catch (err) {
    next(err);
  }
});

export const internalRoutes: Router = router;

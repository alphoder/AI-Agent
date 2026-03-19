import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { RoomServiceClient, AccessToken, VideoGrant } from 'livekit-server-sdk';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { redis, RedisKeys } from '../config/redis';
import { logger } from '../config/logger';
import { config } from '../config/env';

// Helper type to bridge AuthenticatedRequest handlers with Express router
type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);
router.use(tenantMiddleware as unknown as RequestHandler);

const roomService = new RoomServiceClient(
  config.LIVEKIT_URL,
  config.LIVEKIT_API_KEY,
  config.LIVEKIT_API_SECRET,
);

/**
 * POST /api/sessions — Create a new training session
 */
router.post('/', rateLimit(5), wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { assignment_id } = req.body;
    const tenantId = req.user!.tid;
    const userId = req.user!.sub;

    if (!assignment_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ASSIGNMENT', message: 'Assignment ID required' },
      });
    }

    // Validate assignment belongs to user and fetch all related config
    const assignment = await db.tenantQuery(tenantId,
      `SELECT sa.id, sa.scenario_id, sa.user_id, sa.status,
              s.status as scenario_status, s.persona_id, s.title, s.max_duration_sec, s.max_turns,
              s.objective, s.opening_context, s.opening_message, s.scoring_rubric,
              p.system_prompt, p.guardrails, p.rag_enabled, p.rag_top_k,
              p.rag_similarity_threshold, p.temperature, p.avatar_id, p.name as persona_name,
              a.provider, a.provider_avatar_id,
              t.max_concurrent_sessions, t.session_duration_limit_sec, t.idle_timeout_sec,
              t.avatar_provider
       FROM scenario_assignments sa
       JOIN scenarios s ON sa.scenario_id = s.id
       JOIN personas p ON s.persona_id = p.id
       JOIN avatars a ON p.avatar_id = a.id
       JOIN tenants t ON sa.tenant_id = t.id
       WHERE sa.id = $1 AND sa.user_id = $2`,
      [assignment_id, userId],
    );

    if (assignment.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Assignment not found' },
      });
    }

    const row = assignment.rows[0];

    if (row.scenario_status !== 'active') {
      return res.status(400).json({
        success: false,
        error: { code: 'SCENARIO_INACTIVE', message: 'Scenario is not active' },
      });
    }

    // Enforce concurrent session limit via Redis atomic increment
    const activeKey = RedisKeys.tenantActiveSessions(tenantId);
    const currentActive = parseInt(await redis.get(activeKey) || '0', 10);

    if (currentActive >= row.max_concurrent_sessions) {
      return res.status(429).json({
        success: false,
        error: { code: 'SESSION_LIMIT', message: 'Maximum concurrent sessions reached' },
      });
    }

    // Create session record in the database
    const sessionResult = await db.tenantQuery(tenantId,
      `INSERT INTO sessions (tenant_id, assignment_id, user_id, scenario_id, status)
       VALUES ($1, $2, $3, $4, 'created')
       RETURNING id`,
      [tenantId, assignment_id, userId, row.scenario_id],
    );
    const sessionId = sessionResult.rows[0].id;

    // Increment active sessions counter with TTL
    await redis.incr(activeKey);
    await redis.expire(activeKey, 7200); // 2hr TTL safety net

    const roomName = `session-${sessionId}`;
    const livekitUrl = config.LIVEKIT_URL;

    // Create LiveKit room
    try {
      await roomService.createRoom({
        name: roomName,
        emptyTimeout: row.idle_timeout_sec || 300,
        maxParticipants: 2, // learner + AI bot
      });
    } catch (err) {
      // Decrement counter if room creation fails
      await redis.decr(activeKey);
      logger.error({ err, sessionId }, 'Failed to create LiveKit room');
      throw err;
    }

    // Generate participant token for the learner
    const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
      identity: `user-${userId}`,
      name: req.user!.sub,
      metadata: JSON.stringify({ sessionId, tenantId, role: 'learner' }),
    });
    const videoGrant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    };
    token.addGrant(videoGrant);
    token.ttl = Math.min(row.session_duration_limit_sec || 3600, 7200); // max 2hr

    const livekitToken = await token.toJwt();

    // Update session with LiveKit room ID
    await db.tenantQuery(tenantId,
      'UPDATE sessions SET livekit_room_id = $1 WHERE id = $2',
      [roomName, sessionId],
    );

    // Update assignment status to in_progress
    await db.tenantQuery(tenantId,
      "UPDATE scenario_assignments SET status = 'in_progress' WHERE id = $1",
      [assignment_id],
    );

    // Notify AI service to spawn bot (fire-and-forget)
    const aiServiceUrl = config.AI_SERVICE_URL;
    fetch(`${aiServiceUrl}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        tenant_id: tenantId,
        scenario_id: row.scenario_id,
        livekit_room: roomName,
        scenario_config: {
          title: row.title,
          objective: row.objective,
          opening_context: row.opening_context,
          opening_message: row.opening_message,
          max_duration_sec: row.max_duration_sec,
          max_turns: row.max_turns,
          scoring_rubric: row.scoring_rubric,
        },
        persona_config: {
          id: row.persona_id,
          name: row.persona_name,
          system_prompt: row.system_prompt,
          guardrails: row.guardrails,
          rag_enabled: row.rag_enabled,
          rag_top_k: row.rag_top_k,
          rag_similarity_threshold: row.rag_similarity_threshold,
          temperature: row.temperature,
          provider_avatar_id: row.provider_avatar_id,
        },
        avatar_provider: row.avatar_provider,
      }),
    }).catch(err => logger.error({ err, sessionId }, 'AI service session start notification failed'));

    res.status(201).json({
      success: true,
      data: {
        sessionId,
        livekitToken,
        livekitUrl,
        sessionConfig: {
          maxDurationSec: row.session_duration_limit_sec,
          idleTimeoutSec: row.idle_timeout_sec,
          scenarioTitle: row.title,
          personaName: row.persona_name,
          maxTurns: row.max_turns,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}));

/**
 * POST /api/sessions/:id/end — End a training session
 */
router.post('/:id/end', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tid;
    const sessionId = req.params.id;

    // Update session status and compute duration
    const sessionResult = await db.tenantQuery(tenantId,
      `UPDATE sessions
       SET status = 'completed', ended_at = NOW(),
           duration_sec = EXTRACT(EPOCH FROM (NOW() - started_at))
       WHERE id = $1 AND tenant_id = $2 AND status != 'completed'
       RETURNING id, assignment_id, livekit_room_id`,
      [sessionId, tenantId],
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found or already ended' },
      });
    }

    const { assignment_id, livekit_room_id } = sessionResult.rows[0];

    // Decrement active sessions counter (floor at 0)
    const activeKey = RedisKeys.tenantActiveSessions(tenantId);
    const newCount = await redis.decr(activeKey);
    if (newCount < 0) {
      await redis.set(activeKey, '0');
    }

    // Update assignment status to completed
    await db.tenantQuery(tenantId,
      "UPDATE scenario_assignments SET status = 'completed' WHERE id = $1",
      [assignment_id],
    );

    // Delete LiveKit room (cleanup)
    if (livekit_room_id) {
      roomService.deleteRoom(livekit_room_id)
        .catch(err => logger.warn({ err, sessionId }, 'Failed to delete LiveKit room'));
    }

    // Notify AI service to end session and trigger scoring (fire-and-forget)
    const aiServiceUrl = config.AI_SERVICE_URL;
    fetch(`${aiServiceUrl}/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, trigger_scoring: true }),
    }).catch(err => logger.error({ err, sessionId }, 'AI service session end notification failed'));

    res.json({
      success: true,
      data: { sessionId, status: 'completed' },
    });
  } catch (err) {
    next(err);
  }
}));

/**
 * GET /api/sessions/:id — Get session details
 */
router.get('/:id', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await db.tenantQuery(req.user!.tid,
      `SELECT s.id, s.tenant_id, s.assignment_id, s.user_id, s.scenario_id,
              s.status, s.livekit_room_id, s.started_at, s.ended_at,
              s.duration_sec, s.total_turns, s.created_at,
              sc.title as scenario_title, sc.objective,
              p.name as persona_name
       FROM sessions s
       JOIN scenarios sc ON s.scenario_id = sc.id
       JOIN personas p ON sc.persona_id = p.id
       WHERE s.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}));

/**
 * GET /api/sessions/:id/transcript — Get session transcript ordered by turn number
 */
router.get('/:id/transcript', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Verify session exists and belongs to tenant
    const sessionCheck = await db.tenantQuery(req.user!.tid,
      'SELECT id FROM sessions WHERE id = $1',
      [req.params.id],
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }

    const result = await db.tenantQuery(req.user!.tid,
      `SELECT st.id, st.session_id, st.turn_number, st.role, st.content,
              st.audio_url, st.duration_ms, st.sentiment, st.created_at
       FROM session_transcripts st
       WHERE st.session_id = $1
       ORDER BY st.turn_number ASC, st.created_at ASC`,
      [req.params.id],
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
}));

/**
 * GET /api/sessions/:id/report — Get session score/report
 */
router.get('/:id/report', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await db.tenantQuery(req.user!.tid,
      `SELECT ss.id, ss.session_id, ss.overall_score, ss.criteria_scores,
              ss.strengths, ss.improvements, ss.narrative_feedback,
              ss.scored_by_model, ss.created_at as scored_at,
              s.duration_sec, s.total_turns, s.started_at, s.ended_at,
              sc.title as scenario_title, sc.scoring_rubric
       FROM session_scores ss
       JOIN sessions s ON ss.session_id = s.id
       JOIN scenarios sc ON s.scenario_id = sc.id
       WHERE ss.session_id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not yet available' },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}));

/**
 * POST /api/sessions/:id/score — Save session score (from AI service)
 */
router.post('/:id/score', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.id;
    const tenantId = req.user!.tid;
    const {
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

    // Verify session exists and belongs to tenant
    const sessionCheck = await db.tenantQuery(tenantId,
      'SELECT id FROM sessions WHERE id = $1',
      [sessionId],
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
    }

    // Upsert score (unique on session_id)
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

    logger.info({ sessionId, overall_score, scored_by_model }, 'Session score saved');

    res.status(201).json({
      success: true,
      data: { id: result.rows[0].id, session_id: sessionId },
    });
  } catch (err) {
    next(err);
  }
}));

/**
 * GET /api/sessions/:id/report/pdf — Download PDF report
 */
router.get('/:id/report/pdf', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const sessionId = req.params.id;
    const tenantId = req.user!.tid;

    // Check S3 cache first
    const { S3Service } = await import('../services/s3-service');
    const pdfKey = `tenants/${tenantId}/reports/${sessionId}.pdf`;
    const cached = await S3Service.exists(pdfKey);

    if (cached) {
      const url = await S3Service.getSignedUrl(pdfKey, 3600);
      return res.json({ success: true, data: { url } });
    }

    // Load report data
    const reportResult = await db.tenantQuery(tenantId,
      `SELECT ss.overall_score, ss.criteria_scores, ss.strengths, ss.improvements,
              ss.narrative_feedback, ss.scored_by_model, ss.created_at as scored_at,
              s.duration_sec, s.total_turns, s.started_at, s.ended_at, s.user_id,
              sc.title as scenario_title, sc.scoring_rubric, sc.objective,
              p.name as persona_name,
              u.display_name as learner_name, u.email as learner_email,
              t.name as tenant_name
       FROM session_scores ss
       JOIN sessions s ON ss.session_id = s.id
       JOIN scenarios sc ON s.scenario_id = sc.id
       JOIN personas p ON sc.persona_id = p.id
       JOIN users u ON s.user_id = u.id
       JOIN tenants t ON s.tenant_id = t.id
       WHERE ss.session_id = $1`,
      [sessionId],
    );

    if (reportResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not yet available' },
      });
    }

    // Load transcript
    const transcriptResult = await db.tenantQuery(tenantId,
      `SELECT turn_number, role, content, duration_ms, created_at
       FROM session_transcripts
       WHERE session_id = $1
       ORDER BY turn_number ASC, created_at ASC`,
      [sessionId],
    );

    const { PDFService } = await import('../services/pdf-service');
    const pdfBuffer = await PDFService.generateReport({
      report: reportResult.rows[0],
      transcript: transcriptResult.rows,
      sessionId,
    });

    // Cache in S3 for 24 hours
    await S3Service.upload(pdfKey, pdfBuffer, 'application/pdf');

    const url = await S3Service.getSignedUrl(pdfKey, 3600);

    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}));

export const sessionRoutes: Router = router;

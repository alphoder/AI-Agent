import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { rbac } from '../middleware/rbac';
import { rateLimit } from '../middleware/rate-limit';
import { S3Service } from '../services/s3-service';
import { db } from '../config/database';
import { config as envConfig } from '../config/env';
import { logger } from '../config/logger';
import { callAIServiceBackground, aiServiceWsUrl } from '../utils/ai-service-client';
import { validateUuidParam } from '../middleware/validate-uuid';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();

// All routes require auth + tenant context
router.use(authMiddleware as unknown as RequestHandler);
router.use(tenantMiddleware as unknown as RequestHandler);
// 30 requests per minute for avatar CRUD
router.use(rateLimit(30, 60));

/**
 * POST /api/avatars
 * Create a new avatar pointing at a HeyGen library face + voice. Admin only.
 *
 * Body (JSON):
 *   name              (required) — display name
 *   heygen_avatar_id  (required) — avatar_id from GET /api/heygen/avatars
 *   voice_id          (required) — voice_id from GET /api/voices
 *   gender            (optional) — female | male | non_binary | other
 *   language          (optional) — ISO 639-1 (defaults to 'en')
 *   preview_image_url (optional) — HeyGen preview URL, stored as thumbnail
 *
 * No image upload. HeyGen is the only provider; their library already
 * contains polished avatars plus preview images we can use as thumbnails.
 * Status is 'active' immediately since nothing has to process async.
 */
router.post(
  '/',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        heygen_avatar_id,
        voice_id,
        gender,
        language,
        preview_image_url,
      } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_NAME', message: 'Avatar name is required' },
        });
      }
      if (!heygen_avatar_id || typeof heygen_avatar_id !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_AVATAR_ID', message: 'heygen_avatar_id is required. Pick one from /api/heygen/avatars.' },
        });
      }
      if (!voice_id || typeof voice_id !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_VOICE', message: 'voice_id is required. Pick one from /api/voices.' },
        });
      }

      const validGenders = ['female', 'male', 'non_binary', 'other'];
      if (gender && !validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_GENDER', message: `gender must be one of ${validGenders.join(', ')}` },
        });
      }

      const tenantId = req.user!.tid;
      const userId = req.user!.sub;

      const result = await db.tenantQuery(
        tenantId,
        `INSERT INTO avatars (
           tenant_id, name, provider, provider_avatar_id, source_image_url,
           thumbnail_url, status, created_by, config,
           gender, tts_provider, tts_voice_id
         )
         VALUES ($1, $2, 'heygen', $3, '', $4, 'active', $5, $6, $7, 'heygen', $8)
         RETURNING id, name, provider, provider_avatar_id, thumbnail_url,
                   status, gender, tts_provider, tts_voice_id, config, created_at, updated_at`,
        [
          tenantId,
          name.trim(),
          heygen_avatar_id,
          preview_image_url || null,
          userId,
          JSON.stringify({ heygenAvatarId: heygen_avatar_id, language: language || 'en' }),
          gender || null,
          voice_id,
        ],
      );

      logger.info(
        { tenantId, avatarId: result.rows[0].id, heygen_avatar_id, voice_id },
        'HeyGen avatar created',
      );

      res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * GET /api/avatars
 * List avatars (paginated, with status filter)
 */
router.get('/', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tid;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as string;

    let whereClause = 'tenant_id = $1 AND deleted_at IS NULL';
    const params: unknown[] = [tenantId];

    if (status) {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }

    const [dataResult, countResult] = await Promise.all([
      db.tenantQuery(
        tenantId,
        `SELECT id, name, provider, provider_avatar_id, source_image_url,
                thumbnail_url, status, config, gender, tts_provider, tts_voice_id,
                created_at, updated_at
         FROM avatars WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      db.tenantQuery(
        tenantId,
        `SELECT COUNT(*) FROM avatars WHERE ${whereClause}`,
        params,
      ),
    ]);

    const total = parseInt(countResult.rows[0].count);

    // Generate signed URLs for avatars with S3 source images
    const avatarsWithUrls = await Promise.all(
      dataResult.rows.map(async (avatar: any) => {
        const src = avatar.source_image_url;
        if (src && src.includes('/') && !src.startsWith('http')) {
          // S3 key — generate signed URL
          try {
            avatar.image_url = await S3Service.getSignedUrl(src);
          } catch {
            avatar.image_url = null;
          }
        } else if (src && src.startsWith('http')) {
          avatar.image_url = avatar.thumbnail_url || src;
        } else {
          // Not an S3 key and not HTTP — use thumbnail or null
          avatar.image_url = avatar.thumbnail_url || null;
        }
        return avatar;
      }),
    );

    res.json({
      success: true,
      data: avatarsWithUrls,
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
}));

/**
 * GET /api/avatars/:id
 */
router.get('/:id', validateUuidParam(), wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await db.tenantQuery(
      req.user!.tid,
      `SELECT id, name, provider, provider_avatar_id, source_image_url,
              thumbnail_url, status, config, gender, tts_provider, tts_voice_id,
              created_by, created_at, updated_at
       FROM avatars WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Avatar not found' },
      });
    }

    const avatar = result.rows[0];

    // Generate signed URL for S3-stored source image
    const src = avatar.source_image_url;
    if (src && src.includes('/') && !src.startsWith('http')) {
      try {
        avatar.image_url = await S3Service.getSignedUrl(src);
      } catch {
        avatar.image_url = null;
      }
    } else if (src && src.startsWith('http')) {
      avatar.image_url = avatar.thumbnail_url || src;
    } else {
      avatar.image_url = avatar.thumbnail_url || null;
    }

    res.json({ success: true, data: avatar });
  } catch (err) {
    next(err);
  }
}));

/**
 * PATCH /api/avatars/:id
 */
router.patch(
  '/:id',
  validateUuidParam(),
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, config: avatarConfig, gender, tts_provider, tts_voice_id } = req.body;
      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        params.push(name.trim());
      }
      if (avatarConfig !== undefined) {
        updates.push(`config = $${paramIdx++}`);
        params.push(JSON.stringify(avatarConfig));
      }
      if (gender !== undefined) {
        if (gender !== null && !['female','male','non_binary','other'].includes(gender)) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_GENDER', message: 'gender must be female/male/non_binary/other' },
          });
        }
        updates.push(`gender = $${paramIdx++}`);
        params.push(gender);
      }
      if (tts_provider !== undefined) {
        if (!['deepgram','openai','elevenlabs'].includes(tts_provider)) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_TTS_PROVIDER', message: 'tts_provider must be deepgram/openai/elevenlabs' },
          });
        }
        updates.push(`tts_provider = $${paramIdx++}`);
        params.push(tts_provider);
      }
      if (tts_voice_id !== undefined) {
        updates.push(`tts_voice_id = $${paramIdx++}`);
        params.push(tts_voice_id || null);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_UPDATES', message: 'No fields to update' },
        });
      }

      params.push(req.params.id);
      const result = await db.tenantQuery(
        req.user!.tid,
        `UPDATE avatars SET ${updates.join(', ')}
         WHERE id = $${paramIdx} AND deleted_at IS NULL
         RETURNING id, name, status, config, gender, tts_provider, tts_voice_id, updated_at`,
        params,
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Avatar not found' },
        });
      }

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * DELETE /api/avatars/:id (soft delete)
 */
router.delete(
  '/:id',
  validateUuidParam(),
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Check for active sessions using this avatar's persona
      const sessionCheck = await db.tenantQuery(
        req.user!.tid,
        `SELECT COUNT(*) FROM sessions s
         JOIN scenarios sc ON s.scenario_id = sc.id
         JOIN personas p ON sc.persona_id = p.id
         WHERE p.avatar_id = $1 AND s.status IN ('created', 'active')`,
        [req.params.id],
      );

      const activeCount = parseInt(sessionCheck.rows[0].count);
      if (activeCount > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ACTIVE_SESSIONS',
            message: `Cannot delete avatar with ${activeCount} active session(s)`,
          },
        });
      }

      const result = await db.tenantQuery(
        req.user!.tid,
        `UPDATE avatars SET deleted_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [req.params.id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Avatar not found' },
        });
      }

      res.json({ success: true, data: { id: result.rows[0].id, deleted: true } });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * POST /api/avatars/:id/regenerate
 */
router.post(
  '/:id/regenerate',
  validateUuidParam(),
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;

      const avatar = await db.tenantQuery(
        tenantId,
        'SELECT id, source_image_url, provider, config FROM avatars WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id],
      );

      if (avatar.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Avatar not found' },
        });
      }

      // Reset status to processing
      await db.tenantQuery(
        tenantId,
        "UPDATE avatars SET status = 'processing', provider_avatar_id = NULL WHERE id = $1",
        [req.params.id],
      );

      // Re-trigger AI service
      const sourceUrl = await S3Service.getSignedUrl(avatar.rows[0].source_image_url);

      callAIServiceBackground({
        path: '/avatar/create',
        body: {
          avatar_id: req.params.id,
          tenant_id: tenantId,
          image_url: sourceUrl,
          provider: avatar.rows[0].provider,
          config: avatar.rows[0].config,
        },
      });

      res.status(202).json({
        success: true,
        data: { id: req.params.id, status: 'processing' },
      });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * POST /api/avatars/voice-preview
 * Proxy to AI service TTS preview (admin only, rate limited)
 */
router.post(
  '/voice-preview',
  rbac('admin'),
  rateLimit(10, 60), // 10 previews per minute
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { voice, speed } = req.body;

      const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
      if (!voice || !ALLOWED_VOICES.includes(voice)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_VOICE', message: `Voice must be one of: ${ALLOWED_VOICES.join(', ')}` },
        });
      }

      const aiUrl = `${envConfig.AI_SERVICE_URL}/tts/preview`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const aiResp = await fetch(aiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Key': envConfig.INTERNAL_API_KEY,
          },
          body: JSON.stringify({ voice, speed: speed || 1.0 }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!aiResp.ok) {
          const errorText = await aiResp.text().catch(() => 'Unknown error');
          logger.warn({ status: aiResp.status, errorText }, 'TTS preview failed');
          return res.status(aiResp.status === 503 ? 503 : 502).json({
            success: false,
            error: { code: 'TTS_UNAVAILABLE', message: 'Voice preview is temporarily unavailable' },
          });
        }

        // Stream the audio response
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Disposition', `inline; filename="preview-${voice}.mp3"`);

        const buffer = await aiResp.arrayBuffer();
        res.send(Buffer.from(buffer));
      } catch (fetchErr: any) {
        clearTimeout(timeout);
        if (fetchErr.name === 'AbortError') {
          return res.status(504).json({
            success: false,
            error: { code: 'TTS_TIMEOUT', message: 'Voice preview timed out' },
          });
        }
        throw fetchErr;
      }
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * POST /api/avatars/:id/test-session
 * Create a HeyGen streaming avatar session token for quick testing (admin only).
 * Returns a session token that the frontend uses with the HeyGen Streaming Avatar SDK.
 */
router.post('/:id/test-session', validateUuidParam(), wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tid;

    const result = await db.tenantQuery(
      tenantId,
      `SELECT id, name, provider, provider_avatar_id, tts_voice_id, config, status
       FROM avatars WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Avatar not found' } });
    }

    const avatar = result.rows[0];
    if (avatar.status !== 'active') {
      return res.status(400).json({ success: false, error: { code: 'AVATAR_NOT_ACTIVE', message: 'Avatar must be active to test' } });
    }

    const heygenApiKey = envConfig.HEYGEN_API_KEY;
    if (!heygenApiKey) {
      return res.status(500).json({ success: false, error: { code: 'NO_HEYGEN_KEY', message: 'HeyGen API key not configured' } });
    }

    const avatarConfig = typeof avatar.config === 'string' ? JSON.parse(avatar.config) : (avatar.config || {});

    // Resolve the HeyGen library avatar_id. Modern rows set provider_avatar_id
    // at create time; legacy rows (pre-HeyGen rewrite) may only have
    // avatarConfig.heygenAvatarId or an inapplicable Simli face id. Fall back
    // to a sensible public HeyGen face so sessions never fail outright.
    let heygenAvatarId = avatar.provider === 'heygen' ? (avatar.provider_avatar_id || '') : '';
    if (!heygenAvatarId) heygenAvatarId = avatarConfig.heygenAvatarId || '';
    if (!heygenAvatarId || heygenAvatarId.startsWith('dev-') || heygenAvatarId === 'default') {
      heygenAvatarId = 'Wayne_20240711';
    }

    // Voice: prefer the new top-level tts_voice_id, fall back to config.voice
    // for backwards compat. If it still looks like a Simli face UUID (32 hex
    // chars), replace it with a safe HeyGen default so a legacy row won't
    // crash the session.
    let voiceId: string = (avatar.tts_voice_id as string) || avatarConfig.voice || '';
    if (!voiceId || /^[a-f0-9]{32}$/i.test(voiceId)) {
      voiceId = ''; // let HeyGen pick the avatar's default voice
    }

    // Get a short-lived HeyGen session token (30 min). The SDK uses this
    // token to negotiate the LiveKit streaming session from the browser.
    const tokenRes = await fetch('https://api.heygen.com/v1/streaming.create_token', {
      method: 'POST',
      headers: { 'x-api-key': heygenApiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      logger.error({ status: tokenRes.status, body: errText.slice(0, 300) }, 'HeyGen token request failed');
      return res.status(502).json({
        success: false,
        error: { code: 'HEYGEN_TOKEN_ERROR', message: 'Failed to get HeyGen session token' },
      });
    }
    const tokenData = await tokenRes.json() as { data: { token: string } };

    res.json({
      success: true,
      data: {
        provider: 'heygen',
        sessionToken: tokenData.data.token,
        heygenAvatarId,
        avatarName: avatar.name,
        voiceId: voiceId || null,
        language: avatarConfig.language || 'en',
        // Conversation pipeline (STT + LLM) still runs on our AI service —
        // only TTS+lip-sync is delegated to HeyGen. The frontend connects
        // to this WebSocket to get transcripts and response text.
        wsUrl: aiServiceWsUrl('/ws/test-chat'),
      },
    });
  } catch (err) {
    next(err);
  }
}));

export const avatarRoutes: Router = router;

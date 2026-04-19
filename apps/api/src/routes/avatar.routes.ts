import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// All routes require auth + tenant context
router.use(authMiddleware as unknown as RequestHandler);
router.use(tenantMiddleware as unknown as RequestHandler);
// 30 requests per minute for avatar CRUD
router.use(rateLimit(30, 60));

// Magic byte validation
const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
};

function validateMagicBytes(buffer: Buffer, mimetype: string): boolean {
  const patterns = MAGIC_BYTES[mimetype];
  if (!patterns) return false;
  return patterns.some((pattern) =>
    buffer.subarray(0, pattern.length).equals(pattern),
  );
}

/**
 * POST /api/avatars
 * Create a new avatar (admin only)
 */
router.post(
  '/',
  rbac('admin'),
  upload.single('image'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'Image file is required' },
        });
      }

      // Validate mime type
      if (!['image/jpeg', 'image/png'].includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FILE_TYPE', message: 'Only JPEG and PNG files are allowed' },
        });
      }

      // Validate magic bytes
      if (!validateMagicBytes(file.buffer, file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FILE', message: 'File content does not match declared type' },
        });
      }

      const { name, gender, tts_provider, tts_voice_id } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_NAME', message: 'Avatar name is required' },
        });
      }

      const validGenders = ['female', 'male', 'non_binary', 'other'];
      if (gender && !validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_GENDER', message: `gender must be one of ${validGenders.join(', ')}` },
        });
      }

      const validTtsProviders = ['deepgram', 'openai', 'elevenlabs'];
      if (tts_provider && !validTtsProviders.includes(tts_provider)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_TTS_PROVIDER', message: `tts_provider must be one of ${validTtsProviders.join(', ')}` },
        });
      }

      const tenantId = req.user!.tid;
      const userId = req.user!.sub;

      // Create DB record first
      const result = await db.tenantQuery(
        tenantId,
        `INSERT INTO avatars (
           tenant_id, name, provider, source_image_url, status, created_by, config,
           gender, tts_provider, tts_voice_id
         )
         VALUES ($1, $2, $3, '', 'processing', $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          tenantId,
          name.trim(),
          (req as any).tenantConfig?.avatar_provider || 'simli',
          userId,
          JSON.stringify(req.body.config || {}),
          gender || null,
          tts_provider || 'deepgram',
          tts_voice_id || 'aura-2-asteria-en',
        ],
      );

      const avatarId = result.rows[0].id;
      const ext = file.mimetype === 'image/jpeg' ? 'jpg' : 'png';
      const s3Key = S3Service.avatarKey(tenantId, avatarId, `source.${ext}`);

      // Upload to S3
      await S3Service.upload(s3Key, file.buffer, file.mimetype);
      const sourceUrl = await S3Service.getSignedUrl(s3Key);

      // Update DB with S3 URL
      await db.tenantQuery(
        tenantId,
        'UPDATE avatars SET source_image_url = $1 WHERE id = $2',
        [s3Key, avatarId],
      );

      // Call AI service to create avatar (async, don't await)
      callAIServiceBackground({
        path: '/avatar/create',
        body: {
          avatar_id: avatarId,
          tenant_id: tenantId,
          image_url: sourceUrl,
          provider: (req as any).tenantConfig?.avatar_provider || 'simli',
          config: req.body.config || {},
        },
      });

      res.status(202).json({
        success: true,
        data: { id: avatarId, status: 'processing' },
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
      `SELECT id, name, provider, provider_avatar_id, config, status
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

    const avatarConfig = typeof avatar.config === 'string' ? JSON.parse(avatar.config) : (avatar.config || {});

    if (avatar.provider === 'simli') {
      // --- SIMLI COMPOSE (audio-in → lip-sync video) ---
      const simliApiKey = envConfig.SIMLI_API_KEY;
      if (!simliApiKey) {
        return res.status(500).json({ success: false, error: { code: 'NO_SIMLI_KEY', message: 'Simli API key not configured' } });
      }

      let faceId = avatar.provider_avatar_id || '';
      if (!faceId || faceId.startsWith('dev-')) {
        faceId = 'tmp_s3_dg_eo';  // Default Simli demo face
      }

      res.json({
        success: true,
        data: {
          provider: 'simli',
          simliApiKey,
          faceId,
          avatarName: avatar.name,
          voiceId: avatarConfig.voice || 'nova',
          // AI service WebSocket URL for the conversation pipeline.
          // Derived from AI_SERVICE_URL so it works on both localhost (ws://)
          // and production behind HTTPS (wss://) — never hardcode here.
          wsUrl: aiServiceWsUrl('/ws/test-chat'),
        },
      });

    } else {
      // --- HEYGEN ---
      const heygenApiKey = envConfig.HEYGEN_API_KEY;
      if (!heygenApiKey) {
        return res.status(500).json({ success: false, error: { code: 'NO_HEYGEN_KEY', message: 'HeyGen API key not configured' } });
      }

      // Get HeyGen session token
      const tokenRes = await fetch('https://api.heygen.com/v1/streaming.create_token', {
        method: 'POST',
        headers: { 'x-api-key': heygenApiKey, 'Content-Type': 'application/json' },
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        logger.error({ status: tokenRes.status, body: errText }, 'HeyGen token request failed');
        return res.status(502).json({ success: false, error: { code: 'HEYGEN_TOKEN_ERROR', message: 'Failed to get HeyGen session token' } });
      }

      const tokenData = await tokenRes.json() as { data: { token: string } };

      let heygenAvatarId = avatar.provider_avatar_id || avatarConfig.heygenAvatarId || '';
      if (!heygenAvatarId || heygenAvatarId.startsWith('dev-') || heygenAvatarId === 'default') {
        heygenAvatarId = 'Wayne_20240711';  // Default HeyGen public avatar
      }

      res.json({
        success: true,
        data: {
          provider: 'heygen',
          sessionToken: tokenData.data.token,
          heygenAvatarId,
          avatarName: avatar.name,
          voiceId: avatarConfig.voice || null,
        },
      });
    }
  } catch (err) {
    next(err);
  }
}));

export const avatarRoutes: Router = router;

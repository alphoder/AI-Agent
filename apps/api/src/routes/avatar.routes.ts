import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import multer from 'multer';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { rbac } from '../middleware/rbac';
import { S3Service } from '../services/s3-service';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { callAIServiceBackground } from '../utils/ai-service-client';

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

      const { name } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_NAME', message: 'Avatar name is required' },
        });
      }

      const tenantId = req.user!.tid;
      const userId = req.user!.sub;

      // Create DB record first
      const result = await db.tenantQuery(
        tenantId,
        `INSERT INTO avatars (tenant_id, name, provider, source_image_url, status, created_by, config)
         VALUES ($1, $2, $3, '', 'processing', $4, $5)
         RETURNING id`,
        [
          tenantId,
          name.trim(),
          (req as any).tenantConfig?.avatar_provider || 'simli',
          userId,
          JSON.stringify(req.body.config || {}),
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
                thumbnail_url, status, config, created_at, updated_at
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

    res.json({
      success: true,
      data: dataResult.rows,
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
router.get('/:id', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await db.tenantQuery(
      req.user!.tid,
      `SELECT id, name, provider, provider_avatar_id, source_image_url,
              thumbnail_url, status, config, created_by, created_at, updated_at
       FROM avatars WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id],
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
}));

/**
 * PATCH /api/avatars/:id
 */
router.patch(
  '/:id',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, config: avatarConfig } = req.body;
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
         RETURNING id, name, status, config, updated_at`,
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

export const avatarRoutes: Router = router;

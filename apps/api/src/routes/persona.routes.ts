import { Router, Response, NextFunction, RequestHandler } from 'express';
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

router.use(authMiddleware as unknown as RequestHandler);
router.use(tenantMiddleware as unknown as RequestHandler);

// File type validation
const ALLOWED_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'text/plain': ['txt'],
  'text/markdown': ['md'],
};

const MAGIC_BYTES: Record<string, Buffer> = {
  'application/pdf': Buffer.from('%PDF'),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': Buffer.from([0x50, 0x4b, 0x03, 0x04]),
};

function getFileType(mimetype: string): string | null {
  const types = ALLOWED_TYPES[mimetype];
  return types ? types[0] : null;
}

function validateFileContent(buffer: Buffer, mimetype: string): boolean {
  const magic = MAGIC_BYTES[mimetype];
  if (!magic) return true; // txt/md don't have magic bytes
  return buffer.subarray(0, magic.length).equals(magic);
}

/**
 * POST /api/personas
 * Create a new persona (admin only).
 * Validates 1:1 avatar relationship — avatar must not be linked to another persona.
 */
router.post(
  '/',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const userId = req.user!.sub;

      const {
        name,
        description,
        avatar_id,
        system_prompt,
        guardrails,
        rag_enabled,
        temperature,
      } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_NAME', message: 'Persona name is required' },
        });
      }

      if (!avatar_id) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_AVATAR', message: 'Avatar ID is required' },
        });
      }

      if (!system_prompt?.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_SYSTEM_PROMPT', message: 'System prompt is required' },
        });
      }

      // Verify avatar exists and is active
      const avatarCheck = await db.tenantQuery(
        tenantId,
        `SELECT id FROM avatars WHERE id = $1 AND deleted_at IS NULL`,
        [avatar_id],
      );

      if (avatarCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'AVATAR_NOT_FOUND', message: 'Avatar not found' },
        });
      }

      // 1:1 validation — check avatar is not already linked to another persona
      const linkedCheck = await db.tenantQuery(
        tenantId,
        `SELECT id, name FROM personas WHERE avatar_id = $1 AND deleted_at IS NULL`,
        [avatar_id],
      );

      if (linkedCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'AVATAR_ALREADY_LINKED',
            message: `Avatar is already linked to persona "${linkedCheck.rows[0].name}" (${linkedCheck.rows[0].id})`,
          },
        });
      }

      const result = await db.tenantQuery(
        tenantId,
        `INSERT INTO personas (
           tenant_id, name, description, avatar_id, system_prompt,
           guardrails, rag_enabled, temperature, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, description, avatar_id, system_prompt,
                   guardrails, rag_enabled, temperature, created_by,
                   created_at, updated_at`,
        [
          tenantId,
          name.trim(),
          description?.trim() || null,
          avatar_id,
          system_prompt.trim(),
          JSON.stringify(guardrails || {}),
          rag_enabled ?? false,
          temperature ?? 0.7,
          userId,
        ],
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
 * GET /api/personas
 * List personas (paginated) with avatar info.
 */
router.get('/', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tid;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      db.tenantQuery(
        tenantId,
        `SELECT p.id, p.name, p.description, p.avatar_id, p.system_prompt,
                p.guardrails, p.rag_enabled, p.temperature,
                p.created_by, p.created_at, p.updated_at,
                a.name AS avatar_name, a.provider AS avatar_provider,
                a.status AS avatar_status, a.thumbnail_url AS avatar_thumbnail_url
         FROM personas p
         LEFT JOIN avatars a ON p.avatar_id = a.id AND a.deleted_at IS NULL
         WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
         ORDER BY p.created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      db.tenantQuery(
        tenantId,
        `SELECT COUNT(*) FROM personas WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId],
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
 * GET /api/personas/:id
 * Get a single persona with avatar details.
 */
router.get('/:id', wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await db.tenantQuery(
      req.user!.tid,
      `SELECT p.id, p.name, p.description, p.avatar_id, p.system_prompt,
              p.guardrails, p.rag_enabled, p.temperature,
              p.created_by, p.created_at, p.updated_at,
              a.name AS avatar_name, a.provider AS avatar_provider,
              a.provider_avatar_id, a.source_image_url AS avatar_source_image_url,
              a.thumbnail_url AS avatar_thumbnail_url,
              a.status AS avatar_status, a.config AS avatar_config
       FROM personas p
       LEFT JOIN avatars a ON p.avatar_id = a.id AND a.deleted_at IS NULL
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Persona not found' },
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}));

/**
 * PATCH /api/personas/:id
 * Update persona fields: name, description, system_prompt, guardrails,
 * rag_enabled, temperature.
 */
router.patch(
  '/:id',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { name, description, system_prompt, guardrails, rag_enabled, temperature } = req.body;
      const updates: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        params.push(name.trim());
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIdx++}`);
        params.push(description?.trim() || null);
      }
      if (system_prompt !== undefined) {
        updates.push(`system_prompt = $${paramIdx++}`);
        params.push(system_prompt.trim());
      }
      if (guardrails !== undefined) {
        updates.push(`guardrails = $${paramIdx++}`);
        params.push(JSON.stringify(guardrails));
      }
      if (rag_enabled !== undefined) {
        updates.push(`rag_enabled = $${paramIdx++}`);
        params.push(rag_enabled);
      }
      if (temperature !== undefined) {
        if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_TEMPERATURE', message: 'Temperature must be a number between 0 and 2' },
          });
        }
        updates.push(`temperature = $${paramIdx++}`);
        params.push(temperature);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_UPDATES', message: 'No fields to update' },
        });
      }

      updates.push(`updated_at = NOW()`);

      params.push(req.params.id);
      const result = await db.tenantQuery(
        req.user!.tid,
        `UPDATE personas SET ${updates.join(', ')}
         WHERE id = $${paramIdx} AND deleted_at IS NULL
         RETURNING id, name, description, avatar_id, system_prompt,
                   guardrails, rag_enabled, temperature, updated_at`,
        params,
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Persona not found' },
        });
      }

      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * DELETE /api/personas/:id
 * Soft delete a persona.
 */
router.delete(
  '/:id',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;

      // Check for active sessions using this persona
      const sessionCheck = await db.tenantQuery(
        tenantId,
        `SELECT COUNT(*) FROM sessions s
         JOIN scenarios sc ON s.scenario_id = sc.id
         WHERE sc.persona_id = $1 AND s.status IN ('created', 'active')`,
        [req.params.id],
      );

      const activeCount = parseInt(sessionCheck.rows[0].count);
      if (activeCount > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ACTIVE_SESSIONS',
            message: `Cannot delete persona with ${activeCount} active session(s)`,
          },
        });
      }

      const result = await db.tenantQuery(
        tenantId,
        `UPDATE personas SET deleted_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [req.params.id],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Persona not found' },
        });
      }

      res.json({ success: true, data: { id: result.rows[0].id, deleted: true } });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * POST /api/personas/:id/documents
 * Upload a document (PDF/DOCX/TXT/MD, max 50MB) for RAG.
 * Stores in S3 and triggers async embedding via AI service.
 */
router.post(
  '/:id/documents',
  rbac('admin'),
  upload.single('file'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const userId = req.user!.sub;
      const personaId = req.params.id;

      // Verify persona exists
      const personaCheck = await db.tenantQuery(
        tenantId,
        `SELECT id, rag_enabled FROM personas WHERE id = $1 AND deleted_at IS NULL`,
        [personaId],
      );

      if (personaCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Persona not found' },
        });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FILE', message: 'Document file is required' },
        });
      }

      // Validate MIME type
      const fileType = getFileType(file.mimetype);
      if (!fileType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Only PDF, DOCX, TXT, and MD files are allowed',
          },
        });
      }

      // Validate magic bytes for PDF and DOCX
      if (!validateFileContent(file.buffer, file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILE',
            message: 'File content does not match declared type',
          },
        });
      }

      // Create DB record first
      const docResult = await db.tenantQuery(
        tenantId,
        `INSERT INTO knowledge_base_documents (
           tenant_id, persona_id, original_filename, s3_key,
           file_type, file_size_bytes, embedding_status, created_by
         )
         VALUES ($1, $2, $3, '', $4, $5, 'pending', $6)
         RETURNING id`,
        [
          tenantId,
          personaId,
          file.originalname,
          fileType,
          file.size,
          userId,
        ],
      );

      const docId = docResult.rows[0].id;
      const s3Key = S3Service.documentKey(tenantId, personaId, docId, file.originalname);

      // Upload to S3
      await S3Service.upload(s3Key, file.buffer, file.mimetype);

      // Update DB with S3 key
      await db.tenantQuery(
        tenantId,
        `UPDATE knowledge_base_documents SET s3_key = $1 WHERE id = $2`,
        [s3Key, docId],
      );

      // Trigger async embedding via AI service
      const s3Url = await S3Service.getSignedUrl(s3Key);

      callAIServiceBackground({
        path: '/embedding/create',
        body: {
          document_id: docId,
          persona_id: personaId,
          tenant_id: tenantId,
          file_url: s3Url,
          file_type: fileType,
          original_filename: file.originalname,
        },
      });

      res.status(202).json({
        success: true,
        data: {
          id: docId,
          persona_id: personaId,
          original_filename: file.originalname,
          file_type: fileType,
          file_size_bytes: file.size,
          embedding_status: 'pending',
        },
      });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * GET /api/personas/:id/documents
 * List documents for a persona with their embedding status.
 */
router.get(
  '/:id/documents',
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const personaId = req.params.id;

      // Verify persona exists
      const personaCheck = await db.tenantQuery(
        tenantId,
        `SELECT id FROM personas WHERE id = $1 AND deleted_at IS NULL`,
        [personaId],
      );

      if (personaCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Persona not found' },
        });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      const [dataResult, countResult] = await Promise.all([
        db.tenantQuery(
          tenantId,
          `SELECT id, persona_id, original_filename, file_type, file_size_bytes,
                  chunk_count, total_tokens, embedding_status, embedding_error,
                  processing_started_at, processing_completed_at,
                  created_by, created_at, updated_at
           FROM knowledge_base_documents
           WHERE persona_id = $1 AND tenant_id = $2
           ORDER BY created_at DESC
           LIMIT $3 OFFSET $4`,
          [personaId, tenantId, limit, offset],
        ),
        db.tenantQuery(
          tenantId,
          `SELECT COUNT(*) FROM knowledge_base_documents
           WHERE persona_id = $1 AND tenant_id = $2`,
          [personaId, tenantId],
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
  }),
);

/**
 * DELETE /api/personas/:id/documents/:docId
 * Remove a document from DB, S3, and trigger vector deletion.
 */
router.delete(
  '/:id/documents/:docId',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const { id: personaId, docId } = req.params;

      // Fetch the document to get the S3 key
      const docResult = await db.tenantQuery(
        tenantId,
        `SELECT id, s3_key FROM knowledge_base_documents
         WHERE id = $1 AND persona_id = $2 AND tenant_id = $3`,
        [docId, personaId, tenantId],
      );

      if (docResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Document not found' },
        });
      }

      const s3Key = docResult.rows[0].s3_key;

      // Delete from S3
      if (s3Key) {
        await S3Service.delete(s3Key).catch((err) =>
          logger.error({ err, docId, s3Key }, 'Failed to delete document from S3'),
        );
      }

      // Delete from DB
      await db.tenantQuery(
        tenantId,
        `DELETE FROM knowledge_base_documents WHERE id = $1 AND tenant_id = $2`,
        [docId, tenantId],
      );

      // Trigger vector deletion in AI service (async, don't await)
      callAIServiceBackground({
        path: '/embedding/delete',
        body: {
          document_id: docId,
          persona_id: personaId,
          tenant_id: tenantId,
        },
      });

      res.json({ success: true, data: { id: docId, deleted: true } });
    } catch (err) {
      next(err);
    }
  }),
);

/**
 * POST /api/personas/:id/documents/:docId/reprocess
 * Re-trigger embedding for a failed document.
 */
router.post(
  '/:id/documents/:docId/reprocess',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user!.tid;
      const { id: personaId, docId } = req.params;

      // Fetch the document
      const docResult = await db.tenantQuery(
        tenantId,
        `SELECT id, s3_key, file_type, original_filename, embedding_status
         FROM knowledge_base_documents
         WHERE id = $1 AND persona_id = $2 AND tenant_id = $3`,
        [docId, personaId, tenantId],
      );

      if (docResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Document not found' },
        });
      }

      const doc = docResult.rows[0];

      if (doc.embedding_status === 'processing') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ALREADY_PROCESSING',
            message: 'Document is already being processed',
          },
        });
      }

      // Reset status to pending
      await db.tenantQuery(
        tenantId,
        `UPDATE knowledge_base_documents
         SET embedding_status = 'pending',
             embedding_error = NULL,
             processing_started_at = NULL,
             processing_completed_at = NULL,
             chunk_count = NULL,
             total_tokens = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [docId],
      );

      // Re-trigger embedding via AI service
      const s3Url = await S3Service.getSignedUrl(doc.s3_key);

      callAIServiceBackground({
        path: '/embedding/create',
        body: {
          document_id: docId,
          persona_id: personaId,
          tenant_id: tenantId,
          file_url: s3Url,
          file_type: doc.file_type,
          original_filename: doc.original_filename,
          reprocess: true,
        },
      });

      res.status(202).json({
        success: true,
        data: { id: docId, embedding_status: 'pending' },
      });
    } catch (err) {
      next(err);
    }
  }),
);

export const personaRoutes: Router = router;

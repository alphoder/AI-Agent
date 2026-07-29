import { Router, Response, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { boardFor, parseScope, parseMetric, parseWindow } from '../services/competition-service';

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

const MAX_FIELD = 60;

/** Public-facing text: control chars stripped, length capped. */
function clean(value: unknown, max = MAX_FIELD): string {
  // eslint-disable-next-line no-control-regex
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * GET /api/competition?scope=&metric=&window=
 * Rate limited: it is an aggregate over every user in scope.
 */
router.get('/', rateLimit(60), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const board = await boardFor(
    req.user!.sub,
    parseScope(req.query.scope),
    parseMetric(req.query.metric),
    parseWindow(req.query.window),
  );
  res.json({ success: true, data: board });
}));

/**
 * PATCH /api/competition/profile — set where I practise from.
 * These strings group PUBLIC boards, so they are sanitised here rather than trusted.
 */
router.patch('/profile', rateLimit(30), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const b = req.body ?? {};
  const patch: Record<string, string> = {};
  for (const key of ['org', 'city', 'state'] as const) {
    if (b[key] !== undefined) patch[key] = clean(b[key]);
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ success: false, error: { code: 'NOTHING_TO_UPDATE', message: 'Send org, city or state.' } });
  }
  const result = await db.query(
    `UPDATE users
        SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{profile}',
              COALESCE(metadata->'profile', '{}'::jsonb) || $2::jsonb, true),
            updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING COALESCE(metadata->'profile', '{}'::jsonb) AS profile`,
    [req.user!.sub, JSON.stringify(patch)],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }
  res.json({ success: true, data: result.rows[0].profile });
}));

export const competitionRoutes: Router = router;
export const __test = { clean };

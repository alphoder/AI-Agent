import { Router, Response, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { analyticsFor, completedFor, parseRange } from '../services/analytics-service';

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

/** GET /api/analytics/me?range=7d|30d|all — my numbers, computed on read. */
router.get('/me', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const data = await analyticsFor(req.user!.sub, parseRange(req.query.range));
  res.json({ success: true, data });
}));

/** GET /api/analytics/completed — every scenario I have finished, best result first. */
router.get('/completed', wrap(async (req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, data: await completedFor(req.user!.sub) });
}));

export const analyticsRoutes: Router = router;

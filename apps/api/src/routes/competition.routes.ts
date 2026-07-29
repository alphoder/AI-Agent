import { Router, Response, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { rateLimit } from '../middleware/rate-limit';
import { boardFor, parseScope, parseMetric, parseWindow } from '../services/competition-service';

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

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

export const competitionRoutes: Router = router;

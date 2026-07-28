import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { rateLimit } from '../middleware/rate-limit';
import { aiServiceWsUrl } from '../utils/ai-service-client';
import { signWsTicket } from '../utils/ws-ticket';


const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);
router.use(rateLimit(30, 60));

/**
 * POST /api/assistant/session — issue a short-lived ticket for the voice
 * assistant WebSocket (Gemini Live on key 2). One assistant socket per user.
 */
router.post('/session', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const ticket = signWsTicket(`assistant:${me}`, me);
  const wsUrl = `${aiServiceWsUrl('/ws/assistant')}?ticket=${encodeURIComponent(ticket)}`;
  res.json({ success: true, data: { wsUrl } });
}));

export const assistantRoutes: Router = router;

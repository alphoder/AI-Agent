import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import { callAIService } from '../utils/ai-service-client';
import { wrap } from '../utils/wrap';

const router: Router = Router();
router.use(authMiddleware);
// Flash-Lite and a 60s drill, so this is cheap — but it is still a model call
// per attempt, and the page can be re-run endlessly.
router.use(rateLimit(60));

/**
 * POST /api/speak/rate — score a one-minute impromptu speech.
 * Body: { topic, transcript, duration_sec, words, fillers }
 *
 * Nothing is stored: the transcript comes from the browser's own speech
 * recognition and goes straight to the rater. There is no session row and no
 * audio, which is why this needs no scenario and no wallet check.
 */
router.post('/rate', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const { topic, transcript, duration_sec, words, fillers } = req.body ?? {};
  if (typeof topic !== 'string' || !topic.trim() || typeof transcript !== 'string') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_BODY', message: 'topic and transcript are required' },
    });
  }
  try {
    const aiRes = await callAIService({
      path: '/speech/rate',
      body: {
        topic: topic.slice(0, 300),
        transcript: transcript.slice(0, 6000),
        duration_sec: Number(duration_sec) || 60,
        words: Number(words) || 0,
        fillers: Number(fillers) || 0,
      },
      timeoutMs: 30000,
    });
    res.json({ success: true, data: await aiRes.json() });
  } catch {
    res.status(502).json({
      success: false,
      error: { code: 'AI_UNAVAILABLE', message: 'Rating is unavailable right now. Your speech is still on screen.' },
    });
  }
}));

export const speakRoutes: Router = router;

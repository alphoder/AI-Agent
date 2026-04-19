import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

/**
 * Hardcoded catalog of TTS voices. Kept in code (not the DB) because:
 *   - the provider owns the canonical list; we just expose a curated subset
 *   - no admin should be able to add fake voice IDs through the API
 *
 * To add a new voice: append here, redeploy. Gender is used by the UI to
 * suggest a matching voice when the admin picks an avatar of a given gender.
 */
interface VoiceEntry {
  id: string;
  name: string;
  provider: 'deepgram' | 'openai' | 'elevenlabs';
  gender: 'female' | 'male' | 'non_binary';
  accent?: string;
  description?: string;
}

const VOICES: VoiceEntry[] = [
  // Deepgram Aura — English
  { provider: 'deepgram', id: 'aura-asteria-en', name: 'Asteria', gender: 'female', accent: 'US', description: 'Warm, conversational' },
  { provider: 'deepgram', id: 'aura-luna-en',    name: 'Luna',    gender: 'female', accent: 'US', description: 'Youthful, upbeat' },
  { provider: 'deepgram', id: 'aura-stella-en',  name: 'Stella',  gender: 'female', accent: 'US', description: 'Friendly, clear' },
  { provider: 'deepgram', id: 'aura-athena-en',  name: 'Athena',  gender: 'female', accent: 'UK', description: 'Mature, authoritative' },
  { provider: 'deepgram', id: 'aura-hera-en',    name: 'Hera',    gender: 'female', accent: 'US', description: 'Business professional' },
  { provider: 'deepgram', id: 'aura-orion-en',   name: 'Orion',   gender: 'male',   accent: 'US', description: 'Calm, measured' },
  { provider: 'deepgram', id: 'aura-arcas-en',   name: 'Arcas',   gender: 'male',   accent: 'US', description: 'Casual, friendly' },
  { provider: 'deepgram', id: 'aura-perseus-en', name: 'Perseus', gender: 'male',   accent: 'US', description: 'Energetic, confident' },
  { provider: 'deepgram', id: 'aura-angus-en',   name: 'Angus',   gender: 'male',   accent: 'IE', description: 'Irish, warm' },
  { provider: 'deepgram', id: 'aura-orpheus-en', name: 'Orpheus', gender: 'male',   accent: 'US', description: 'Deep, narrator' },
  { provider: 'deepgram', id: 'aura-helios-en',  name: 'Helios',  gender: 'male',   accent: 'UK', description: 'British, commanding' },
  { provider: 'deepgram', id: 'aura-zeus-en',    name: 'Zeus',    gender: 'male',   accent: 'US', description: 'Strong, authoritative' },

  // OpenAI TTS — all voices
  { provider: 'openai', id: 'alloy',   name: 'Alloy',   gender: 'non_binary', description: 'Balanced, versatile' },
  { provider: 'openai', id: 'echo',    name: 'Echo',    gender: 'male',       description: 'Crisp, informative' },
  { provider: 'openai', id: 'fable',   name: 'Fable',   gender: 'male',       description: 'Storytelling, warm' },
  { provider: 'openai', id: 'onyx',    name: 'Onyx',    gender: 'male',       description: 'Deep, confident' },
  { provider: 'openai', id: 'nova',    name: 'Nova',    gender: 'female',     description: 'Youthful, friendly' },
  { provider: 'openai', id: 'shimmer', name: 'Shimmer', gender: 'female',     description: 'Warm, reassuring' },
  { provider: 'openai', id: 'sage',    name: 'Sage',    gender: 'female',     description: 'Gentle, thoughtful' },
  { provider: 'openai', id: 'ash',     name: 'Ash',     gender: 'male',       description: 'Firm, direct' },
];

/**
 * GET /api/voices?provider=&gender=
 * Returns the TTS voice catalog, optionally filtered by provider and/or gender.
 * Used by the Avatar form (gender-matched dropdown).
 */
router.get(
  '/',
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    const gender = typeof req.query.gender === 'string' ? req.query.gender : undefined;

    let filtered = VOICES;
    if (provider) {
      filtered = filtered.filter((v) => v.provider === provider);
    }
    if (gender) {
      filtered = filtered.filter((v) => v.gender === gender);
    }

    res.json({
      success: true,
      data: filtered,
      meta: { total: filtered.length, providers: ['deepgram', 'openai', 'elevenlabs'] },
    });
  }),
);

export const voicesRoutes: Router = router;

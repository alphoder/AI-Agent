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
 * Gender is used by the UI to suggest matching voices when the admin picks
 * an avatar of a given gender. The source of truth is Deepgram's own
 * published TTS model catalog (https://developers.deepgram.com/docs/tts-models).
 *
 * All `id` values have been verified against Deepgram's public docs — passing
 * one of these strings to `/speak?model=<id>` returns audio without error.
 */
interface VoiceEntry {
  id: string;
  name: string;
  provider: 'deepgram' | 'openai' | 'elevenlabs';
  gender: 'female' | 'male' | 'non_binary';
  accent?: string;
  language?: string;
  model_family?: 'aura-1' | 'aura-2';
  description?: string;
}

const VOICES: VoiceEntry[] = [
  // -------------------------------------------------------------------------
  // Deepgram Aura-2 — English (recommended defaults)
  // -------------------------------------------------------------------------
  // Feminine
  { provider: 'deepgram', id: 'aura-2-andromeda-en', name: 'Andromeda', gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Casual, expressive — customer service' },
  { provider: 'deepgram', id: 'aura-2-asteria-en',   name: 'Asteria',   gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Clear, confident, energetic' },
  { provider: 'deepgram', id: 'aura-2-athena-en',    name: 'Athena',    gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Calm, smooth, professional storyteller' },
  { provider: 'deepgram', id: 'aura-2-aurora-en',    name: 'Aurora',    gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Cheerful, expressive, energetic' },
  { provider: 'deepgram', id: 'aura-2-callista-en',  name: 'Callista',  gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Clear, professional IVR voice' },
  { provider: 'deepgram', id: 'aura-2-cora-en',      name: 'Cora',      gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Smooth, melodic, caring' },
  { provider: 'deepgram', id: 'aura-2-delia-en',     name: 'Delia',     gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Casual, friendly, breathy' },
  { provider: 'deepgram', id: 'aura-2-electra-en',   name: 'Electra',   gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Professional, engaging, knowledgeable' },
  { provider: 'deepgram', id: 'aura-2-harmonia-en',  name: 'Harmonia',  gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Empathetic, calm, confident' },
  { provider: 'deepgram', id: 'aura-2-hera-en',      name: 'Hera',      gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Smooth, warm, professional' },
  { provider: 'deepgram', id: 'aura-2-juno-en',      name: 'Juno',      gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Natural, melodic, breathy' },
  { provider: 'deepgram', id: 'aura-2-luna-en',      name: 'Luna',      gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Friendly, natural, engaging' },
  { provider: 'deepgram', id: 'aura-2-ophelia-en',   name: 'Ophelia',   gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Expressive, enthusiastic' },
  { provider: 'deepgram', id: 'aura-2-pandora-en',   name: 'Pandora',   gender: 'female', accent: 'British',   language: 'en', model_family: 'aura-2', description: 'Smooth, calm, melodic (UK)' },
  { provider: 'deepgram', id: 'aura-2-phoebe-en',    name: 'Phoebe',    gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Energetic, warm, casual' },
  { provider: 'deepgram', id: 'aura-2-theia-en',     name: 'Theia',     gender: 'female', accent: 'Australian',language: 'en', model_family: 'aura-2', description: 'Expressive, polite, sincere (AU)' },
  { provider: 'deepgram', id: 'aura-2-vesta-en',     name: 'Vesta',     gender: 'female', accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Natural, patient, empathetic' },
  // Masculine
  { provider: 'deepgram', id: 'aura-2-apollo-en',    name: 'Apollo',    gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Confident, casual, conversational' },
  { provider: 'deepgram', id: 'aura-2-arcas-en',     name: 'Arcas',     gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Natural, smooth, clear' },
  { provider: 'deepgram', id: 'aura-2-aries-en',     name: 'Aries',     gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Warm, energetic, caring' },
  { provider: 'deepgram', id: 'aura-2-atlas-en',     name: 'Atlas',     gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Enthusiastic, approachable, friendly' },
  { provider: 'deepgram', id: 'aura-2-draco-en',     name: 'Draco',     gender: 'male',   accent: 'British',   language: 'en', model_family: 'aura-2', description: 'Warm baritone narrator (UK)' },
  { provider: 'deepgram', id: 'aura-2-hermes-en',    name: 'Hermes',    gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Expressive, engaging, professional' },
  { provider: 'deepgram', id: 'aura-2-hyperion-en',  name: 'Hyperion',  gender: 'male',   accent: 'Australian',language: 'en', model_family: 'aura-2', description: 'Caring, warm, empathetic (AU)' },
  { provider: 'deepgram', id: 'aura-2-jupiter-en',   name: 'Jupiter',   gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Expressive baritone, informative' },
  { provider: 'deepgram', id: 'aura-2-mars-en',      name: 'Mars',      gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Smooth, patient baritone' },
  { provider: 'deepgram', id: 'aura-2-neptune-en',   name: 'Neptune',   gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Professional, patient, polite' },
  { provider: 'deepgram', id: 'aura-2-odysseus-en',  name: 'Odysseus',  gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Calm, smooth, professional' },
  { provider: 'deepgram', id: 'aura-2-orion-en',     name: 'Orion',     gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Approachable, comfortable, polite' },
  { provider: 'deepgram', id: 'aura-2-orpheus-en',   name: 'Orpheus',   gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Clear, confident, trustworthy' },
  { provider: 'deepgram', id: 'aura-2-pluto-en',     name: 'Pluto',     gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Smooth, empathetic baritone narrator' },
  { provider: 'deepgram', id: 'aura-2-saturn-en',    name: 'Saturn',    gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Knowledgeable, confident baritone' },
  { provider: 'deepgram', id: 'aura-2-zeus-en',      name: 'Zeus',      gender: 'male',   accent: 'American',  language: 'en', model_family: 'aura-2', description: 'Deep, trustworthy, smooth' },

  // -------------------------------------------------------------------------
  // Deepgram Aura-1 — English (legacy, still supported)
  // -------------------------------------------------------------------------
  { provider: 'deepgram', id: 'aura-asteria-en',  name: 'Asteria (v1)',  gender: 'female', accent: 'American', language: 'en', model_family: 'aura-1', description: 'Legacy — clear, confident, energetic' },
  { provider: 'deepgram', id: 'aura-luna-en',     name: 'Luna (v1)',     gender: 'female', accent: 'American', language: 'en', model_family: 'aura-1', description: 'Legacy — friendly, natural, engaging' },
  { provider: 'deepgram', id: 'aura-stella-en',   name: 'Stella (v1)',   gender: 'female', accent: 'American', language: 'en', model_family: 'aura-1', description: 'Legacy — clear, professional' },
  { provider: 'deepgram', id: 'aura-athena-en',   name: 'Athena (v1)',   gender: 'female', accent: 'British',  language: 'en', model_family: 'aura-1', description: 'Legacy — calm storyteller (UK)' },
  { provider: 'deepgram', id: 'aura-hera-en',     name: 'Hera (v1)',     gender: 'female', accent: 'American', language: 'en', model_family: 'aura-1', description: 'Legacy — smooth, warm, professional' },
  { provider: 'deepgram', id: 'aura-orion-en',    name: 'Orion (v1)',    gender: 'male',   accent: 'American', language: 'en', model_family: 'aura-1', description: 'Legacy — approachable, calm' },
  { provider: 'deepgram', id: 'aura-arcas-en',    name: 'Arcas (v1)',    gender: 'male',   accent: 'American', language: 'en', model_family: 'aura-1', description: 'Legacy — natural, smooth, clear' },
  { provider: 'deepgram', id: 'aura-perseus-en',  name: 'Perseus (v1)',  gender: 'male',   accent: 'American', language: 'en', model_family: 'aura-1', description: 'Legacy — confident, professional' },
  { provider: 'deepgram', id: 'aura-angus-en',    name: 'Angus (v1)',    gender: 'male',   accent: 'Irish',    language: 'en', model_family: 'aura-1', description: 'Legacy — warm, friendly (IE)' },
  { provider: 'deepgram', id: 'aura-orpheus-en',  name: 'Orpheus (v1)',  gender: 'male',   accent: 'American', language: 'en', model_family: 'aura-1', description: 'Legacy — professional, trustworthy' },
  { provider: 'deepgram', id: 'aura-helios-en',   name: 'Helios (v1)',   gender: 'male',   accent: 'British',  language: 'en', model_family: 'aura-1', description: 'Legacy — professional (UK)' },
  { provider: 'deepgram', id: 'aura-zeus-en',     name: 'Zeus (v1)',     gender: 'male',   accent: 'American', language: 'en', model_family: 'aura-1', description: 'Legacy — deep, trustworthy' },

  // -------------------------------------------------------------------------
  // OpenAI TTS — all voices (from tts-1 / tts-1-hd models)
  // -------------------------------------------------------------------------
  { provider: 'openai', id: 'alloy',   name: 'Alloy',   gender: 'non_binary', language: 'en', description: 'Balanced, versatile' },
  { provider: 'openai', id: 'echo',    name: 'Echo',    gender: 'male',       language: 'en', description: 'Crisp, informative' },
  { provider: 'openai', id: 'fable',   name: 'Fable',   gender: 'male',       language: 'en', description: 'Storytelling, warm' },
  { provider: 'openai', id: 'onyx',    name: 'Onyx',    gender: 'male',       language: 'en', description: 'Deep, confident' },
  { provider: 'openai', id: 'ash',     name: 'Ash',     gender: 'male',       language: 'en', description: 'Firm, direct' },
  { provider: 'openai', id: 'nova',    name: 'Nova',    gender: 'female',     language: 'en', description: 'Youthful, friendly' },
  { provider: 'openai', id: 'shimmer', name: 'Shimmer', gender: 'female',     language: 'en', description: 'Warm, reassuring' },
  { provider: 'openai', id: 'sage',    name: 'Sage',    gender: 'female',     language: 'en', description: 'Gentle, thoughtful' },
];

/**
 * GET /api/voices?provider=&gender=&language=
 * Returns the TTS voice catalog, optionally filtered.
 * Used by the Avatar form (gender-matched dropdown).
 */
router.get(
  '/',
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    const gender = typeof req.query.gender === 'string' ? req.query.gender : undefined;
    const language = typeof req.query.language === 'string' ? req.query.language : undefined;

    let filtered = VOICES;
    if (provider) filtered = filtered.filter((v) => v.provider === provider);
    if (gender)   filtered = filtered.filter((v) => v.gender === gender);
    if (language) filtered = filtered.filter((v) => (v.language || 'en') === language);

    res.json({
      success: true,
      data: filtered,
      meta: {
        total: filtered.length,
        providers: ['deepgram', 'openai'],
        languages: ['en'],
      },
    });
  }),
);

export const voicesRoutes: Router = router;

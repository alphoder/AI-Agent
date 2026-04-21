import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { config } from '../config/env';
import { logger } from '../config/logger';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

/**
 * HeyGen voice entry as the platform exposes it to the UI. We don't surface
 * every field HeyGen returns — just what the Avatar create form needs to
 * render filterable cards with a preview button.
 */
interface Voice {
  id: string;
  name: string;
  provider: 'heygen';
  gender: 'female' | 'male' | 'non_binary';
  language: string;         // e.g. 'en', 'es', 'hi', 'fr' (ISO 639-1)
  accent?: string;
  preview_url?: string;     // HeyGen-hosted MP3
  support_pause?: boolean;
  emotion_support?: boolean;
}

// In-memory cache (1 hour TTL). HeyGen's catalog doesn't change often and
// their API is rate-limited, so we don't want to hit it on every keystroke.
interface CacheEntry<T> { value: T; expiresAt: number }
let voiceCache: CacheEntry<Voice[]> | null = null;
const CACHE_MS = 60 * 60 * 1000;

/**
 * Normalise HeyGen's language code ("English", "en-US", "Hindi") down to a
 * short ISO 639-1 code we can pair with Deepgram's STT language flag.
 */
function toShortLang(raw: string | undefined): string {
  if (!raw) return 'en';
  const s = String(raw).toLowerCase().trim();
  // Already ISO?
  if (/^[a-z]{2}(-[A-Z]{2})?$/i.test(s) && s.length <= 5) return s.slice(0, 2).toLowerCase();
  const map: Record<string, string> = {
    english: 'en', spanish: 'es', french: 'fr', german: 'de',
    italian: 'it', portuguese: 'pt', dutch: 'nl', japanese: 'ja',
    korean: 'ko', chinese: 'zh', mandarin: 'zh', arabic: 'ar',
    hindi: 'hi', russian: 'ru', turkish: 'tr', polish: 'pl',
    indonesian: 'id', vietnamese: 'vi', filipino: 'fil', tagalog: 'fil',
    thai: 'th', swedish: 'sv', norwegian: 'no', danish: 'da',
    finnish: 'fi', greek: 'el', hebrew: 'he', czech: 'cs',
    hungarian: 'hu', romanian: 'ro', ukrainian: 'uk', malay: 'ms',
    urdu: 'ur', bengali: 'bn', tamil: 'ta', telugu: 'te',
  };
  for (const [k, v] of Object.entries(map)) if (s.includes(k)) return v;
  return s.slice(0, 2);
}

function toGender(raw: string | undefined): 'female' | 'male' | 'non_binary' {
  if (!raw) return 'non_binary';
  const s = String(raw).toLowerCase();
  if (s.includes('female') || s === 'f' || s.includes('woman')) return 'female';
  if (s.includes('male')   || s === 'm' || s.includes('man'))   return 'male';
  return 'non_binary';
}

async function fetchHeygenVoices(): Promise<Voice[]> {
  if (!config.HEYGEN_API_KEY) {
    logger.warn('HEYGEN_API_KEY not configured; returning empty voice catalog');
    return [];
  }

  const resp = await fetch('https://api.heygen.com/v2/voices', {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'x-api-key': config.HEYGEN_API_KEY,
    },
    // Modest timeout so a slow HeyGen response doesn't hang the dashboard
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    logger.error({ status: resp.status, body: body.slice(0, 300) }, 'HeyGen /v2/voices failed');
    throw new Error(`HeyGen voices fetch failed: ${resp.status}`);
  }

  const json = await resp.json() as { data?: { voices?: unknown[] }, error?: unknown };
  const raw = Array.isArray(json?.data?.voices) ? json.data!.voices! : [];

  const voices: Voice[] = raw.map((r) => {
    const v = r as Record<string, unknown>;
    const id = String(v.voice_id ?? v.id ?? '');
    if (!id) return null;
    const language = String(v.language ?? v.language_code ?? 'English');
    return {
      id,
      name: String(v.name ?? v.display_name ?? id),
      provider: 'heygen' as const,
      gender: toGender(v.gender as string | undefined),
      language: toShortLang(language),
      accent: (typeof v.accent === 'string' ? v.accent : undefined)
        || (typeof v.language === 'string' ? v.language : undefined),
      preview_url: typeof v.preview_audio === 'string'
        ? v.preview_audio
        : (typeof v.sample === 'string' ? v.sample : undefined),
      support_pause: Boolean(v.support_pause),
      emotion_support: Boolean(v.emotion_support),
    };
  }).filter(Boolean) as Voice[];

  return voices;
}

async function getVoices(): Promise<Voice[]> {
  const now = Date.now();
  if (voiceCache && voiceCache.expiresAt > now) return voiceCache.value;
  try {
    const voices = await fetchHeygenVoices();
    voiceCache = { value: voices, expiresAt: now + CACHE_MS };
    return voices;
  } catch (err) {
    // On failure, serve stale cache if we have one; otherwise empty.
    if (voiceCache) return voiceCache.value;
    logger.error({ err: (err as Error).message }, 'voices cache miss + fetch failed');
    return [];
  }
}

/**
 * GET /api/voices?gender=&language=&search=
 * Returns HeyGen's voice catalog, cached for 1 hour. All voices are HeyGen
 * since that's the only provider in this deployment.
 */
router.get(
  '/',
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    const gender = typeof req.query.gender === 'string' ? req.query.gender : undefined;
    const language = typeof req.query.language === 'string' ? req.query.language : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    const all = await getVoices();
    let filtered = all;
    if (gender)   filtered = filtered.filter((v) => v.gender === gender);
    if (language) filtered = filtered.filter((v) => v.language === language.slice(0, 2).toLowerCase());
    if (search) {
      filtered = filtered.filter((v) =>
        v.name.toLowerCase().includes(search) ||
        (v.accent || '').toLowerCase().includes(search),
      );
    }

    const languages = Array.from(new Set(all.map((v) => v.language))).sort();

    res.json({
      success: true,
      data: filtered,
      meta: {
        total: filtered.length,
        total_in_catalog: all.length,
        providers: ['heygen'],
        languages,
      },
    });
  }),
);

export const voicesRoutes: Router = router;

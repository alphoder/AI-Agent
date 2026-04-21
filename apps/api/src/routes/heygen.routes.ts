import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { rbac } from '../middleware/rbac';
import { config } from '../config/env';
import { logger } from '../config/logger';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

/**
 * Filtered shape of a HeyGen public avatar, ready for the Avatar create form.
 * `avatar_id` is the string you pass to `avatar.createStartAvatar({ avatarName })`
 * when the streaming SDK starts a session.
 */
interface HeygenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender?: 'female' | 'male' | 'non_binary';
  preview_image_url?: string;
  preview_video_url?: string;
  premium?: boolean;
}

interface CacheEntry<T> { value: T; expiresAt: number }
let avatarCache: CacheEntry<HeygenAvatar[]> | null = null;
const CACHE_MS = 60 * 60 * 1000;

function toGender(raw: string | undefined): 'female' | 'male' | 'non_binary' {
  if (!raw) return 'non_binary';
  const s = String(raw).toLowerCase();
  if (s.includes('female') || s === 'f' || s.includes('woman')) return 'female';
  if (s.includes('male')   || s === 'm' || s.includes('man'))   return 'male';
  return 'non_binary';
}

async function fetchHeygenAvatars(): Promise<HeygenAvatar[]> {
  if (!config.HEYGEN_API_KEY) {
    logger.warn('HEYGEN_API_KEY not configured; returning empty avatar catalog');
    return [];
  }

  const resp = await fetch('https://api.heygen.com/v2/avatars', {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'x-api-key': config.HEYGEN_API_KEY,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    logger.error({ status: resp.status, body: body.slice(0, 300) }, 'HeyGen /v2/avatars failed');
    throw new Error(`HeyGen avatars fetch failed: ${resp.status}`);
  }

  const json = await resp.json() as { data?: { avatars?: unknown[] } };
  const raw = Array.isArray(json?.data?.avatars) ? json.data!.avatars! : [];

  return raw.map((r) => {
    const a = r as Record<string, unknown>;
    const id = String(a.avatar_id ?? a.id ?? '');
    if (!id) return null;
    return {
      avatar_id: id,
      avatar_name: String(a.avatar_name ?? a.name ?? id),
      gender: toGender(a.gender as string | undefined),
      preview_image_url: typeof a.preview_image_url === 'string' ? a.preview_image_url : undefined,
      preview_video_url: typeof a.preview_video_url === 'string' ? a.preview_video_url : undefined,
      premium: Boolean(a.premium),
    } as HeygenAvatar;
  }).filter(Boolean) as HeygenAvatar[];
}

async function getAvatars(): Promise<HeygenAvatar[]> {
  const now = Date.now();
  if (avatarCache && avatarCache.expiresAt > now) return avatarCache.value;
  try {
    const list = await fetchHeygenAvatars();
    avatarCache = { value: list, expiresAt: now + CACHE_MS };
    return list;
  } catch (err) {
    if (avatarCache) return avatarCache.value;
    logger.error({ err: (err as Error).message }, 'avatar cache miss + fetch failed');
    return [];
  }
}

/**
 * GET /api/heygen/avatars?gender=&search=
 * Returns HeyGen's public avatar library (admin only). Admin picks one when
 * creating a platform avatar record; the `avatar_id` here is stored as
 * `avatars.provider_avatar_id` in our DB.
 */
router.get(
  '/avatars',
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    const gender = typeof req.query.gender === 'string' ? req.query.gender : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    const all = await getAvatars();
    let filtered = all;
    if (gender) filtered = filtered.filter((a) => a.gender === gender);
    if (search) filtered = filtered.filter((a) => a.avatar_name.toLowerCase().includes(search));

    res.json({
      success: true,
      data: filtered,
      meta: { total: filtered.length, total_in_catalog: all.length, provider: 'heygen' },
    });
  }),
);

export const heygenRoutes: Router = router;

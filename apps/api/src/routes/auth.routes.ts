import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import { JWTService } from '../services/jwt-service';
import { verifyGoogleIdToken } from '../services/google-auth';
import { upsertGoogleUser } from '../services/user-service';
import { rateLimit } from '../middleware/rate-limit';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { db } from '../config/database';
import { logger } from '../config/logger';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 1000; // 1h, matches JWT
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7d
const isProd = process.env.NODE_ENV === 'production';

// In production the frontend (Vercel) and API (Render) are on different domains,
// so cookies must be SameSite=None; Secure to be sent on cross-site requests.
// On localhost both are same-site, so Lax works without requiring HTTPS.
const COOKIE_SAMESITE = isProd ? 'none' : 'lax';

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: COOKIE_SAMESITE,
    maxAge: REFRESH_COOKIE_MAX_AGE,
    path: '/api/auth',
  });
  res.cookie('access_token', accessToken, {
    httpOnly: false, // readable by Next.js middleware for route protection
    secure: isProd,
    sameSite: COOKIE_SAMESITE,
    maxAge: ACCESS_COOKIE_MAX_AGE,
    path: '/',
  });
}

const router: Router = Router();

router.use(rateLimit(isProd ? 20 : 200));

/**
 * POST /api/auth/dev-login — email + password sign-in for local development and
 * demos, so the whole app can be tried without Google OAuth.
 *
 * SECURITY (deliberate, do not loosen):
 *  - Only ONE allow-listed email can ever sign in this way (DEV_LOGIN_EMAIL).
 *  - In production the route is DISABLED unless DEV_LOGIN_PASSWORD is explicitly
 *    set to >=12 chars. There is no hardcoded password that works on the live
 *    site; the dev default only applies when NODE_ENV !== 'production'.
 *  - Timing-safe comparison, and it 404s (not 401s) when disabled so the
 *    endpoint is invisible.
 * The account is created as an admin, which also has every learner capability.
 */
const DEV_LOGIN_EMAIL = (process.env.DEV_LOGIN_EMAIL || 'dev@speakcoach.local').toLowerCase();

function devLoginPassword(): string | null {
  const explicit = process.env.DEV_LOGIN_PASSWORD;
  if (explicit && explicit.length >= 12) return explicit;
  if (isProd) return null;            // never a default credential in production
  return 'speakcoach-dev-2026';       // local convenience only
}

router.post('/dev-login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const expected = devLoginPassword();
    if (!expected) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
    }
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const emailOk = email === DEV_LOGIN_EMAIL;
    const passOk = password.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));
    if (!emailOk || !passOk) {
      logger.warn({ email }, 'dev-login rejected');
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } });
    }

    // Upsert the dev account as an admin (admins get learner features too).
    const result = await db.query(
      `INSERT INTO users (email, name, is_active, last_login_at, metadata)
       VALUES ($1, $2, true, NOW(), '{"role":"admin"}'::jsonb)
       ON CONFLICT (email) WHERE deleted_at IS NULL DO UPDATE SET
         last_login_at = NOW(),
         metadata = COALESCE(users.metadata, '{}'::jsonb) || '{"role":"admin"}'::jsonb,
         updated_at = NOW()
       RETURNING id, email, name, picture, is_active`,
      [DEV_LOGIN_EMAIL, 'Dev Tester'],
    );
    const user = result.rows[0];
    const { accessToken, refreshToken } = await JWTService.issueTokens(user);
    setAuthCookies(res, accessToken, refreshToken);
    logger.info({ userId: user.id }, 'dev-login success');

    res.json({
      success: true,
      data: { accessToken, user: { id: user.id, email: user.email, name: user.name, picture: user.picture } },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/google
 * Body: { credential: <Google ID token> }
 * Verifies the Google ID token, upserts the user, issues app tokens.
 */
router.post('/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const credential = req.body?.credential;
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CREDENTIAL', message: 'Google credential is required' },
      });
    }

    const profile = await verifyGoogleIdToken(credential);
    const user = await upsertGoogleUser(profile);
    const { accessToken, refreshToken } = await JWTService.issueTokens(user);
    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      success: true,
      data: {
        accessToken,
        user: { id: user.id, email: user.email, name: user.name, picture: user.picture },
      },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Google login failed');
    return res.status(401).json({
      success: false,
      error: { code: 'GOOGLE_AUTH_FAILED', message: 'Could not verify Google sign-in' },
    });
  }
});

/**
 * POST /api/auth/refresh — rotate refresh token, issue new access token.
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh token not found' },
      });
    }

    const result = await JWTService.rotateRefreshToken(refreshToken);
    if (!result) {
      res.clearCookie('refresh_token', { path: '/api/auth' });
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalid or expired' },
      });
    }

    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ success: true, data: { accessToken: result.accessToken } });
  } catch (err) {
    logger.error({ err }, 'Token refresh failed');
    next(err);
  }
});

/**
 * POST /api/auth/logout — revoke all refresh tokens, clear cookies.
 */
router.post('/logout', authMiddleware as unknown as RequestHandler, wrap(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.sub) {
      await JWTService.revokeAllUserTokens(req.user.sub);
    }
    res.clearCookie('refresh_token', { path: '/api/auth' });
    res.clearCookie('access_token', { path: '/' });
    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (err) {
    logger.error({ err }, 'Logout failed');
    next(err);
  }
}));

/**
 * GET /api/auth/me — current user.
 */
router.get('/me', authMiddleware as unknown as RequestHandler, wrap(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
  }
  const result = await db.query(
    `SELECT id, email, name, picture, is_active, last_login_at, metadata, created_at, updated_at
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [req.user.sub],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }
  res.json({ success: true, data: result.rows[0] });
}));

/**
 * PATCH /api/auth/me/onboarding — persist the first-run questionnaire answers
 * into users.metadata.onboarding (JSONB merge). Idempotent; safe to call again.
 * Body: { persona?: string, goals?: string[] }
 */
router.patch('/me/onboarding', authMiddleware as unknown as RequestHandler, wrap(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
  }

  const body = req.body ?? {};
  const persona = typeof body.persona === 'string' ? body.persona.trim().slice(0, 40) : null;
  const goals = Array.isArray(body.goals)
    ? body.goals.filter((g: unknown): g is string => typeof g === 'string').map((g: string) => g.trim().slice(0, 40)).slice(0, 12)
    : [];

  const onboarding = {
    persona: persona || null,
    goals,
    completed: true,
    completed_at: new Date().toISOString(),
  };

  const result = await db.query(
    `UPDATE users
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('onboarding', $2::jsonb),
           updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, email, name, picture, is_active, last_login_at, metadata, created_at, updated_at`,
    [req.user.sub, JSON.stringify(onboarding)],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }
  res.json({ success: true, data: result.rows[0] });
}));

/**
 * PATCH /api/auth/me/metadata — general metadata update (JSONB merge).
 * Body: any object containing keys to merge (e.g. settings, billing, teams, goals).
 */
router.patch('/me/metadata', authMiddleware as unknown as RequestHandler, wrap(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
  }

  const payload = req.body ?? {};
  
  const result = await db.query(
    `UPDATE users
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id, email, name, picture, is_active, last_login_at, metadata, created_at, updated_at`,
    [req.user.sub, JSON.stringify(payload)],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }
  res.json({ success: true, data: result.rows[0] });
}));

export const authRoutes: Router = router;

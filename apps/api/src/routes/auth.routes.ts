import { Router, Request, Response, NextFunction } from 'express';
import { SSOAdapter } from '../services/sso-adapter';
import { JWTService } from '../services/jwt-service';
import { resolveRole } from '../services/role-resolver';
import { upsertUser } from '../services/user-service';
import { rateLimit } from '../middleware/rate-limit';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { db } from '../config/database';
import { logger } from '../config/logger';

const router = Router();

// Rate limit: 10/min for auth endpoints
router.use(rateLimit(10));

/**
 * GET /api/auth/sso/init?tenant=<slug>
 * Validate tenant, redirect to IdP
 */
router.get('/sso/init', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantSlug = req.query.tenant as string;

    if (!tenantSlug) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Tenant slug is required' },
      });
    }

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/sso/callback`;
    const { url } = await SSOAdapter.getLoginUrl(tenantSlug, callbackUrl);

    res.redirect(url);
  } catch (err) {
    logger.error({ err }, 'SSO init failed');
    next(err);
  }
});

/**
 * POST /api/auth/sso/callback
 * Validate assertion, upsert user, issue tokens, redirect with fragment token
 */
router.post('/sso/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantSlug = (req.query.tenant as string) || req.body.RelayState;

    if (!tenantSlug) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TENANT', message: 'Cannot determine tenant from callback' },
      });
    }

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/auth/sso/callback`;
    const ssoResult = await SSOAdapter.validateCallback(tenantSlug, req.body, callbackUrl);

    // Fetch tenant for role mapping config
    const tenantResult = await db.query(
      'SELECT id, sso_config FROM tenants WHERE slug = $1',
      [tenantSlug],
    );
    const tenant = tenantResult.rows[0];

    // Resolve role — never defaults to admin
    const role = resolveRole(ssoResult.groups, tenant.sso_config);

    // Upsert user
    const user = await upsertUser({
      tenantId: tenant.id,
      email: ssoResult.email,
      externalId: ssoResult.externalId,
      displayName: ssoResult.displayName,
      role,
    });

    // Issue tokens
    const { accessToken, refreshToken } = await JWTService.issueTokens(user);

    // Set refresh token as httpOnly cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/api/auth',
    });

    // Redirect to frontend with access token in URL fragment
    const frontendUrl =
      process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/callback#access_token=${accessToken}`);
  } catch (err) {
    logger.error({ err }, 'SSO callback failed');
    next(err);
  }
});

/**
 * POST /api/auth/refresh
 * Rotate refresh token, issue new access + refresh tokens
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

    // Set new refresh token cookie
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    res.json({
      success: true,
      data: { accessToken: result.accessToken },
    });
  } catch (err) {
    logger.error({ err }, 'Token refresh failed');
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Revoke refresh token, clear cookie
 */
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (refreshToken) {
      await JWTService.revokeRefreshToken(refreshToken);
    }

    res.clearCookie('refresh_token', { path: '/api/auth' });
    res.json({ success: true, data: { message: 'Logged out' } });
  } catch (err) {
    logger.error({ err }, 'Logout failed');
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Return current user info from JWT
 */
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
    });
  }

  const result = await db.query(
    `SELECT id, tenant_id, email, display_name, role, is_active, last_login_at, metadata
     FROM users WHERE id = $1`,
    [req.user.sub],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    });
  }

  res.json({ success: true, data: result.rows[0] });
});

export const authRoutes = router;

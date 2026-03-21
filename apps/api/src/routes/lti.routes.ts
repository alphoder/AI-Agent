import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import {
  importSPKI,
  importPKCS8,
  exportJWK,
  calculateJwkThumbprint,
  createRemoteJWKSet,
  jwtVerify,
  SignJWT,
  decodeJwt,
} from 'jose';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { rbac } from '../middleware/rbac';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { redis, RedisKeys, RedisTTL } from '../config/redis';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { JWTService } from '../services/jwt-service';
import { upsertUser } from '../services/user-service';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<any>;
const wrap = (fn: AuthHandler): RequestHandler => fn as unknown as RequestHandler;

const router: Router = Router();
// 30 requests per minute for all LTI endpoints
router.use(rateLimit(30, 60));

// ─── Helpers ──────────────────────────────────────────────────────────

const LTI_CLAIMS = {
  ROLES: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  CONTEXT: 'https://purl.imsglobal.org/spec/lti/claim/context',
  CUSTOM: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  MESSAGE_TYPE: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  DEEP_LINKING_SETTINGS: 'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
  CONTENT_ITEMS: 'https://purl.imsglobal.org/spec/lti-dl/claim/content_items',
  DEPLOYMENT_ID: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  TARGET_LINK_URI: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  AGS: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
} as const;

const AGS_SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';

function getLaunchUrl(req: Request): string {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}/api/lti/launch`;
}

function determineLtiRole(roles: string[]): 'admin' | 'learner' {
  const adminRoles = ['Instructor', 'Administrator', 'ContentDeveloper'];
  const isAdmin = roles.some((role) =>
    adminRoles.some((ar) => role.includes(ar)),
  );
  return isAdmin ? 'admin' : 'learner';
}

// ─── 1. JWKS Endpoint ────────────────────────────────────────────────

router.get('/jwks', async (_req: Request, res: Response) => {
  try {
    const publicKey = await importSPKI(config.JWT_PUBLIC_KEY, 'RS256');
    const jwk = await exportJWK(publicKey);
    const kid = await calculateJwkThumbprint(jwk, 'sha256');

    jwk.kid = kid;
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    res.json({ keys: [jwk] });
  } catch (err) {
    logger.error({ err }, 'Failed to serve JWKS');
    res.status(500).json({ success: false, error: { code: 'JWKS_ERROR', message: 'Failed to export JWKS' } });
  }
});

// ─── 2. OIDC Login Initiation ────────────────────────────────────────

router.get('/login', async (req: Request, res: Response) => {
  try {
    const { iss, login_hint, target_link_uri, lti_message_hint, client_id } = req.query as Record<string, string>;

    if (!iss || !client_id || !login_hint) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Missing required parameters: iss, client_id, login_hint' },
      });
    }

    // Validate platform registration
    const platformResult = await db.query(
      'SELECT id, tenant_id, auth_endpoint FROM lti_platforms WHERE issuer = $1 AND client_id = $2',
      [iss, client_id],
    );

    if (platformResult.rows.length === 0) {
      logger.warn({ iss, client_id }, 'LTI login from unregistered platform');
      return res.status(403).json({
        success: false,
        error: { code: 'UNKNOWN_PLATFORM', message: 'Platform not registered' },
      });
    }

    const platform = platformResult.rows[0];

    // Generate nonce and state
    const nonce = crypto.randomUUID();
    const state = crypto.randomUUID();

    // Store nonce in Redis
    await redis.set(
      RedisKeys.ltiNonce(nonce),
      JSON.stringify({ platformId: platform.id, tenantId: platform.tenant_id }),
      'EX',
      RedisTTL.LTI_NONCE,
    );

    // Store state in Redis
    await redis.set(
      `lti:state:${state}`,
      JSON.stringify({ platformId: platform.id, nonce, target_link_uri }),
      'EX',
      RedisTTL.LTI_NONCE,
    );

    // Build redirect URL
    const redirectUrl = new URL(platform.auth_endpoint);
    redirectUrl.searchParams.set('scope', 'openid');
    redirectUrl.searchParams.set('response_type', 'id_token');
    redirectUrl.searchParams.set('client_id', client_id);
    redirectUrl.searchParams.set('redirect_uri', getLaunchUrl(req));
    redirectUrl.searchParams.set('login_hint', login_hint);
    redirectUrl.searchParams.set('state', state);
    redirectUrl.searchParams.set('nonce', nonce);
    redirectUrl.searchParams.set('response_mode', 'form_post');
    redirectUrl.searchParams.set('prompt', 'none');

    if (lti_message_hint) {
      redirectUrl.searchParams.set('lti_message_hint', lti_message_hint);
    }
    if (target_link_uri) {
      redirectUrl.searchParams.set('target_link_uri', target_link_uri);
    }

    logger.info({ iss, client_id, platformId: platform.id }, 'LTI OIDC login initiated');
    return res.redirect(redirectUrl.toString());
  } catch (err) {
    logger.error({ err }, 'LTI login initiation failed');
    return res.status(500).json({
      success: false,
      error: { code: 'LOGIN_ERROR', message: 'Login initiation failed' },
    });
  }
});

// ─── 3. Launch Handler ───────────────────────────────────────────────

router.post('/launch', async (req: Request, res: Response) => {
  try {
    const { id_token, state } = req.body;

    if (!id_token || !state) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Missing id_token or state' },
      });
    }

    // Validate state from Redis
    const stateKey = `lti:state:${state}`;
    const stateData = await redis.get(stateKey);
    if (!stateData) {
      logger.warn({ state }, 'LTI launch with invalid or expired state');
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_STATE', message: 'Invalid or expired state parameter' },
      });
    }
    // Consume state immediately
    await redis.del(stateKey);

    const parsedState = JSON.parse(stateData);

    // Decode id_token without verification to extract issuer
    const unverifiedClaims = decodeJwt(id_token);
    const iss = unverifiedClaims.iss;

    if (!iss) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'id_token missing iss claim' },
      });
    }

    // Fetch platform by issuer
    const platformResult = await db.query(
      'SELECT id, tenant_id, issuer, client_id, jwks_endpoint FROM lti_platforms WHERE id = $1',
      [parsedState.platformId],
    );

    if (platformResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: { code: 'UNKNOWN_PLATFORM', message: 'Platform not found' },
      });
    }

    const platform = platformResult.rows[0];

    // Verify issuer matches
    if (iss !== platform.issuer) {
      logger.warn({ expected: platform.issuer, received: iss }, 'LTI issuer mismatch');
      return res.status(403).json({
        success: false,
        error: { code: 'ISSUER_MISMATCH', message: 'Token issuer does not match platform' },
      });
    }

    // Verify id_token signature using remote JWKS
    const jwks = createRemoteJWKSet(new URL(platform.jwks_endpoint));
    const { payload } = await jwtVerify(id_token, jwks, {
      issuer: platform.issuer,
      audience: platform.client_id,
    });

    // Validate nonce
    const nonce = payload.nonce as string;
    if (!nonce) {
      return res.status(403).json({
        success: false,
        error: { code: 'MISSING_NONCE', message: 'id_token missing nonce claim' },
      });
    }

    const nonceKey = RedisKeys.ltiNonce(nonce);
    const nonceData = await redis.get(nonceKey);
    if (!nonceData) {
      logger.warn({ nonce }, 'LTI launch with invalid or expired nonce');
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_NONCE', message: 'Invalid or expired nonce' },
      });
    }
    // Consume nonce
    await redis.del(nonceKey);

    // Also record nonce in DB to prevent replay across restarts
    await db.query(
      'INSERT INTO lti_nonces (nonce, platform_id, consumed, expires_at) VALUES ($1, $2, true, NOW() + INTERVAL \'10 minutes\')',
      [nonce, platform.id],
    );

    // Extract LTI claims
    const ltiRoles = (payload[LTI_CLAIMS.ROLES] as string[]) || [];
    const ltiContext = payload[LTI_CLAIMS.CONTEXT] as Record<string, string> | undefined;
    const ltiCustom = payload[LTI_CLAIMS.CUSTOM] as Record<string, string> | undefined;
    const messageType = payload[LTI_CLAIMS.MESSAGE_TYPE] as string | undefined;
    const deepLinkingSettings = payload[LTI_CLAIMS.DEEP_LINKING_SETTINGS] as Record<string, unknown> | undefined;
    const agsEndpoint = payload[LTI_CLAIMS.AGS] as Record<string, unknown> | undefined;
    const deploymentId = payload[LTI_CLAIMS.DEPLOYMENT_ID] as string | undefined;
    const sub = payload.sub as string;
    const email = (payload.email as string) || `${sub}@lti.local`;
    const displayName = (payload.name as string) || (payload.given_name as string) || email;

    // Determine role
    const role = determineLtiRole(ltiRoles);

    // JIT user provisioning
    const user = await upsertUser({
      tenantId: platform.tenant_id,
      email,
      externalId: `lti:${platform.id}:${sub}`,
      displayName,
      role,
    });

    // Issue platform JWT
    const tokens = await JWTService.issueTokens({
      id: user.id,
      tenant_id: platform.tenant_id,
      role: user.role,
      email: user.email,
    });

    // Store deep linking settings and AGS endpoint for later use
    if (deepLinkingSettings) {
      await redis.set(
        `lti:dl_settings:${user.id}:${platform.id}`,
        JSON.stringify({ deepLinkingSettings, deploymentId }),
        'EX',
        3600, // 1 hour
      );
    }
    if (agsEndpoint) {
      await redis.set(
        `lti:ags:${platform.tenant_id}:${ltiContext?.id || 'default'}`,
        JSON.stringify(agsEndpoint),
        'EX',
        7200, // 2 hours
      );
    }

    logger.info(
      { userId: user.id, platformId: platform.id, role, messageType },
      'LTI launch successful',
    );

    // Check for deep linking request
    if (messageType === 'LtiDeepLinkingRequest') {
      const frontendUrl = config.corsOrigins[0];
      return res.redirect(
        `${frontendUrl}/lti/deeplinking?access_token=${tokens.accessToken}&platform_id=${platform.id}`,
      );
    }

    // Extract target scenario
    let scenarioId = ltiCustom?.scenario_id || '';
    if (!scenarioId && parsedState.target_link_uri) {
      const targetUrl = new URL(parsedState.target_link_uri);
      scenarioId = targetUrl.searchParams.get('scenario_id') || '';
    }

    // Redirect to frontend with access_token only in URL fragment.
    // The refresh_token is set as an httpOnly cookie — it must never appear in URLs
    // where it would be captured by server logs, browser history, or referrer headers.
    const frontendUrl = config.corsOrigins[0];
    const fragment = new URLSearchParams({
      access_token: tokens.accessToken,
      lti: 'true',
      ...(scenarioId ? { scenario_id: scenarioId } : {}),
    });

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      path: '/',
    });

    return res.redirect(`${frontendUrl}/callback#${fragment.toString()}`);
  } catch (err: any) {
    logger.error({ err: err.message, stack: err.stack }, 'LTI launch failed');

    if (err.code === 'ERR_JWT_EXPIRED') {
      return res.status(403).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'id_token has expired' },
      });
    }

    if (err.code?.startsWith('ERR_JW')) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'id_token verification failed' },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: 'LAUNCH_ERROR', message: 'Launch processing failed' },
    });
  }
});

// ─── 4. Deep Linking Response ────────────────────────────────────────

router.post(
  '/deeplinking',
  authMiddleware as unknown as RequestHandler,
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { scenario_ids, platform_id } = req.body;

      if (!scenario_ids?.length || !platform_id) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Missing scenario_ids or platform_id' },
        });
      }

      // Load platform
      const platformResult = await db.query(
        'SELECT id, tenant_id, issuer, client_id FROM lti_platforms WHERE id = $1',
        [platform_id],
      );

      if (platformResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Platform not found' },
        });
      }

      const platform = platformResult.rows[0];

      // Verify user belongs to the same tenant
      if (req.user!.tid !== platform.tenant_id) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Platform does not belong to your tenant' },
        });
      }

      // Fetch deep linking settings from Redis
      const dlSettingsRaw = await redis.get(`lti:dl_settings:${req.user!.sub}:${platform_id}`);
      if (!dlSettingsRaw) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_DL_SESSION', message: 'No active deep linking session found. Please initiate from LMS.' },
        });
      }
      const { deepLinkingSettings, deploymentId } = JSON.parse(dlSettingsRaw);

      // Load scenarios
      const scenarioResult = await db.tenantQuery(
        platform.tenant_id,
        `SELECT id, title FROM scenarios WHERE id = ANY($1)`,
        [scenario_ids],
      );

      const scenarios = scenarioResult.rows;
      if (scenarios.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'No matching scenarios found' },
        });
      }

      // Build content items
      const contentItems = scenarios.map((scenario: { id: string; title: string }) => ({
        type: 'ltiResourceLink',
        title: scenario.title,
        url: `${getLaunchUrl(req)}?scenario_id=${scenario.id}`,
        custom: {
          scenario_id: scenario.id,
        },
      }));

      // Sign deep linking response JWT
      const nonce = crypto.randomUUID();
      const privateKey = await importPKCS8(config.JWT_PRIVATE_KEY, 'RS256');
      const publicKey = await importSPKI(config.JWT_PUBLIC_KEY, 'RS256');
      const jwk = await exportJWK(publicKey);
      const kid = await calculateJwkThumbprint(jwk, 'sha256');

      const dlResponseJwt = await new SignJWT({
        nonce,
        [LTI_CLAIMS.DEPLOYMENT_ID]: deploymentId,
        [LTI_CLAIMS.MESSAGE_TYPE]: 'LtiDeepLinkingResponse',
        [LTI_CLAIMS.CONTENT_ITEMS]: contentItems,
        'https://purl.imsglobal.org/spec/lti-dl/claim/data': deepLinkingSettings.data,
      })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(platform.client_id)
        .setAudience(platform.issuer)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

      // Clean up deep linking session
      await redis.del(`lti:dl_settings:${req.user!.sub}:${platform_id}`);

      logger.info(
        { platformId: platform_id, scenarioCount: scenarios.length },
        'Deep linking response generated',
      );

      return res.json({
        success: true,
        data: {
          jwt: dlResponseJwt,
          return_url: deepLinkingSettings.deep_link_return_url,
          content_items: contentItems,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Deep linking response failed');
      return res.status(500).json({
        success: false,
        error: { code: 'DL_ERROR', message: 'Failed to generate deep linking response' },
      });
    }
  }),
);

// ─── 5. Grade Passback via AGS ───────────────────────────────────────

router.post(
  '/grades/:sessionId',
  authMiddleware as unknown as RequestHandler,
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const tenantId = req.user!.tid;

      // Load session with score
      const sessionResult = await db.tenantQuery(
        tenantId,
        `SELECT s.id, s.user_id, s.scenario_id, s.status,
                ss.overall_score
         FROM sessions s
         LEFT JOIN session_scores ss ON ss.session_id = s.id
         WHERE s.id = $1 AND s.user_id = $2`,
        [sessionId, req.user!.sub],
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Session not found' },
        });
      }

      const session = sessionResult.rows[0];

      if (session.status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: { code: 'SESSION_INCOMPLETE', message: 'Session is not completed yet' },
        });
      }

      // Find LTI platform for this tenant
      const platformResult = await db.query(
        'SELECT id, client_id, issuer, token_endpoint FROM lti_platforms WHERE tenant_id = $1 LIMIT 1',
        [tenantId],
      );

      if (platformResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_PLATFORM', message: 'No LTI platform configured for this tenant' },
        });
      }

      const platform = platformResult.rows[0];

      // Find AGS endpoint in Redis or session metadata
      const agsRaw = await redis.get(`lti:ags:${tenantId}:default`);
      if (!agsRaw) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_AGS', message: 'No AGS endpoint available. Grade passback not configured.' },
        });
      }

      const agsEndpoint = JSON.parse(agsRaw);
      const lineitemUrl = agsEndpoint.lineitem;

      if (!lineitemUrl) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_LINEITEM', message: 'No lineitem URL in AGS endpoint' },
        });
      }

      // Obtain access token from LMS using client_credentials with JWT assertion
      const accessToken = await obtainLmsAccessToken(platform);

      // POST score to lineitem
      const scorePayload = {
        userId: req.user!.sub,
        scoreOf: 100,
        scoreGiven: session.overall_score ?? 0,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
        timestamp: new Date().toISOString(),
      };

      const scoreUrl = lineitemUrl.endsWith('/')
        ? `${lineitemUrl}scores`
        : `${lineitemUrl}/scores`;

      let scoreResponse = await postScore(scoreUrl, accessToken, scorePayload);

      // Retry once on failure
      if (!scoreResponse.ok) {
        logger.warn(
          { status: scoreResponse.status, sessionId },
          'AGS score post failed, retrying once',
        );
        scoreResponse = await postScore(scoreUrl, accessToken, scorePayload);
      }

      if (!scoreResponse.ok) {
        const errorBody = await scoreResponse.text();
        logger.error(
          { status: scoreResponse.status, body: errorBody, sessionId },
          'AGS score post failed after retry',
        );
        return res.status(502).json({
          success: false,
          error: { code: 'AGS_FAILED', message: 'Failed to post grade to LMS' },
        });
      }

      logger.info(
        { sessionId, score: session.overall_score, platformId: platform.id },
        'AGS grade passback successful',
      );

      return res.json({
        success: true,
        data: {
          session_id: sessionId,
          score_given: session.overall_score,
          score_of: 100,
          activity_progress: 'Completed',
          grading_progress: 'FullyGraded',
        },
      });
    } catch (err) {
      logger.error({ err, sessionId: req.params.sessionId }, 'Grade passback failed');
      return res.status(500).json({
        success: false,
        error: { code: 'GRADE_ERROR', message: 'Grade passback failed' },
      });
    }
  }),
);

// ─── AGS Helpers ─────────────────────────────────────────────────────

async function obtainLmsAccessToken(platform: {
  client_id: string;
  token_endpoint: string;
}): Promise<string> {
  const privateKey = await importPKCS8(config.JWT_PRIVATE_KEY, 'RS256');
  const publicKey = await importSPKI(config.JWT_PUBLIC_KEY, 'RS256');
  const jwk = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(jwk, 'sha256');

  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(platform.client_id)
    .setSubject(platform.client_id)
    .setAudience(platform.token_endpoint)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion,
    scope: AGS_SCORE_SCOPE,
  });

  const response = await fetch(platform.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      { status: response.status, body: errorText },
      'Failed to obtain LMS access token',
    );
    throw new Error(`LMS token request failed: ${response.status}`);
  }

  const tokenData = (await response.json()) as { access_token: string };
  return tokenData.access_token;
}

async function postScore(
  scoreUrl: string,
  accessToken: string,
  scorePayload: Record<string, unknown>,
): Promise<globalThis.Response> {
  return fetch(scoreUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.ims.lis.v1.score+json',
    },
    body: JSON.stringify(scorePayload),
  });
}

// ─── 6. Platform Registration CRUD (admin only) ─────────────────────

// POST /api/lti/platforms – Register a new LTI platform
router.post(
  '/platforms',
  authMiddleware as unknown as RequestHandler,
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tid;
      const { name, issuer, client_id, auth_login_url, auth_token_url, key_set_url } = req.body;

      // --- Input validation ---
      if (!issuer || typeof issuer !== 'string' || !issuer.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_ISSUER', message: 'issuer is required and must be a non-empty string' },
        });
      }

      if (!client_id || typeof client_id !== 'string' || !client_id.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_CLIENT_ID', message: 'client_id is required and must be a non-empty string' },
        });
      }

      if (!auth_login_url || typeof auth_login_url !== 'string' || !auth_login_url.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_AUTH_LOGIN_URL', message: 'auth_login_url is required' },
        });
      }

      if (!auth_token_url || typeof auth_token_url !== 'string' || !auth_token_url.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_AUTH_TOKEN_URL', message: 'auth_token_url is required' },
        });
      }

      if (!key_set_url || typeof key_set_url !== 'string' || !key_set_url.trim()) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_KEY_SET_URL', message: 'key_set_url is required' },
        });
      }

      // Validate URLs are valid
      for (const [label, url] of [['auth_login_url', auth_login_url], ['auth_token_url', auth_token_url], ['key_set_url', key_set_url]]) {
        try {
          new URL(url as string);
        } catch {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_URL', message: `${label} must be a valid URL` },
          });
        }
      }

      // Check for duplicate issuer+client_id
      const dupeCheck = await db.query(
        `SELECT id FROM lti_platforms WHERE issuer = $1 AND client_id = $2`,
        [issuer.trim(), client_id.trim()],
      );

      if (dupeCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: { code: 'DUPLICATE_PLATFORM', message: 'A platform with this issuer and client_id already exists' },
        });
      }

      const result = await db.query(
        `INSERT INTO lti_platforms (tenant_id, issuer, client_id, auth_endpoint, token_endpoint, jwks_endpoint)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, tenant_id, issuer, client_id, auth_endpoint, token_endpoint, jwks_endpoint, created_at, updated_at`,
        [tenantId, issuer.trim(), client_id.trim(), auth_login_url.trim(), auth_token_url.trim(), key_set_url.trim()],
      );

      logger.info(
        { platformId: result.rows[0].id, issuer, tenantId },
        'LTI platform registered',
      );

      return res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (err) {
      logger.error({ err }, 'Failed to register LTI platform');
      return res.status(500).json({
        success: false,
        error: { code: 'PLATFORM_CREATE_ERROR', message: 'Failed to register platform' },
      });
    }
  }),
);

// GET /api/lti/platforms – List all platforms for the tenant
router.get(
  '/platforms',
  authMiddleware as unknown as RequestHandler,
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tid;

      const result = await db.query(
        `SELECT id, tenant_id, issuer, client_id, auth_endpoint, token_endpoint, jwks_endpoint, created_at, updated_at
         FROM lti_platforms
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId],
      );

      return res.json({
        success: true,
        data: result.rows,
        meta: { total: result.rows.length },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to list LTI platforms');
      return res.status(500).json({
        success: false,
        error: { code: 'PLATFORM_LIST_ERROR', message: 'Failed to list platforms' },
      });
    }
  }),
);

// DELETE /api/lti/platforms/:id – Delete a platform registration
router.delete(
  '/platforms/:id',
  authMiddleware as unknown as RequestHandler,
  rbac('admin'),
  wrap(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user!.tid;
      const platformId = req.params.id;

      if (!platformId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_ID', message: 'Platform ID is required' },
        });
      }

      // Verify the platform belongs to this tenant before deleting
      const result = await db.query(
        `DELETE FROM lti_platforms WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [platformId, tenantId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Platform not found or does not belong to your tenant' },
        });
      }

      logger.info(
        { platformId, tenantId },
        'LTI platform deleted',
      );

      return res.json({
        success: true,
        data: { id: result.rows[0].id, deleted: true },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to delete LTI platform');
      return res.status(500).json({
        success: false,
        error: { code: 'PLATFORM_DELETE_ERROR', message: 'Failed to delete platform' },
      });
    }
  }),
);

export const ltiRoutes: Router = router;

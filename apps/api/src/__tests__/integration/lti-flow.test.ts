import crypto from 'crypto';

// Generate RSA key pair for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../config/env', () => ({
  config: {
    JWT_PRIVATE_KEY: privateKey,
    JWT_PUBLIC_KEY: publicKey,
    NODE_ENV: 'test',
    PORT: 4000,
    corsOrigins: ['http://localhost:3000'],
    CORS_ORIGINS: 'http://localhost:3000',
    LIVEKIT_URL: 'ws://localhost:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'devsecret',
    AI_SERVICE_URL: 'http://localhost:8000',
    isDev: false,
    isProd: false,
  },
}));

const mockRedis = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn(),
  on: jest.fn(),
};

jest.mock('../../config/redis', () => ({
  redis: mockRedis,
  RedisKeys: {
    refreshToken: (id: string) => `refresh:${id}`,
    rateLimit: (key: string) => `rate_limit:${key}`,
    tenantConfig: (id: string) => `tenant:${id}:config`,
    ltiNonce: (nonce: string) => `lti:nonce:${nonce}`,
    tenantActiveSessions: (id: string) => `tenant:${id}:active_sessions`,
  },
  RedisTTL: {
    REFRESH_TOKEN: 604800,
    RATE_LIMIT: 60,
    TENANT_CONFIG: 300,
    LTI_NONCE: 600,
    SESSION_HISTORY: 7200,
    SESSION_STATE: 7200,
  },
}));

const mockDb = {
  query: jest.fn(),
  pool: { query: jest.fn(), connect: jest.fn(), on: jest.fn() },
  connect: jest.fn(),
  getClient: jest.fn(),
  withTenant: jest.fn(),
  tenantQuery: jest.fn(),
};

jest.mock('../../config/database', () => ({ db: mockDb }));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../middleware/request-logger', () => ({
  requestLogger: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../middleware/metrics', () => ({
  metricsMiddleware: (_req: any, _res: any, next: any) => next(),
  metricsHandler: (_req: any, res: any) => res.json({}),
}));

jest.mock('../../services/user-service', () => ({
  upsertUser: jest.fn(),
}));

// Mock jose — we need to control jwtVerify and the JWK functions
const mockJwtVerify = jest.fn();
const mockCreateRemoteJWKSet = jest.fn();
const mockDecodeJwt = jest.fn();

jest.mock('jose', () => ({
  importSPKI: jest.fn().mockResolvedValue('mock-public-key-object'),
  importPKCS8: jest.fn().mockResolvedValue('mock-private-key-object'),
  exportJWK: jest.fn().mockResolvedValue({
    kty: 'RSA',
    n: 'mock-modulus',
    e: 'AQAB',
  }),
  calculateJwkThumbprint: jest.fn().mockResolvedValue('mock-kid-thumbprint'),
  createRemoteJWKSet: mockCreateRemoteJWKSet,
  jwtVerify: mockJwtVerify,
  decodeJwt: mockDecodeJwt,
  SignJWT: jest.fn().mockImplementation(() => {
    const builder: any = {};
    builder.setProtectedHeader = jest.fn().mockReturnValue(builder);
    builder.setIssuer = jest.fn().mockReturnValue(builder);
    builder.setSubject = jest.fn().mockReturnValue(builder);
    builder.setAudience = jest.fn().mockReturnValue(builder);
    builder.setIssuedAt = jest.fn().mockReturnValue(builder);
    builder.setExpirationTime = jest.fn().mockReturnValue(builder);
    builder.setJti = jest.fn().mockReturnValue(builder);
    builder.sign = jest.fn().mockResolvedValue('mock-signed-jwt');
    return builder;
  }),
}));

jest.mock('livekit-server-sdk', () => ({
  RoomServiceClient: jest.fn().mockImplementation(() => ({
    createRoom: jest.fn(),
    deleteRoom: jest.fn(),
  })),
  AccessToken: jest.fn().mockImplementation(() => ({
    addGrant: jest.fn(),
    ttl: 0,
    toJwt: jest.fn().mockResolvedValue('mock-livekit-token'),
  })),
  VideoGrant: jest.fn(),
}));

// Mock global fetch for AGS grade passback
(global as any).fetch = jest.fn();

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import request from 'supertest';
import { createApp } from '../../app';
import { JWTService } from '../../services/jwt-service';
import { upsertUser } from '../../services/user-service';

const app = createApp();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const PLATFORM_ID = 'plat-0001';
const CLIENT_ID = 'lti-client-123';
const ISSUER = 'https://lms.example.com';
const AUTH_ENDPOINT = 'https://lms.example.com/auth';
const JWKS_ENDPOINT = 'https://lms.example.com/.well-known/jwks.json';
const TOKEN_ENDPOINT = 'https://lms.example.com/token';

const USER_ID = '22222222-2222-2222-2222-222222222222';

function adminToken() {
  return JWTService.signAccessToken({
    sub: USER_ID,
    tid: TENANT_ID,
    role: 'admin',
    email: 'admin@acme.com',
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LTI 1.3 Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
  });

  // ─── 1. JWKS Endpoint ──────────────────────────────────────────────

  describe('GET /api/lti/jwks', () => {
    it('returns a valid JWK Set', async () => {
      const res = await request(app).get('/api/lti/jwks');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keys');
      expect(Array.isArray(res.body.keys)).toBe(true);
      expect(res.body.keys).toHaveLength(1);

      const jwk = res.body.keys[0];
      expect(jwk.kty).toBe('RSA');
      expect(jwk.alg).toBe('RS256');
      expect(jwk.use).toBe('sig');
      expect(jwk.kid).toBe('mock-kid-thumbprint');
    });
  });

  // ─── 2. OIDC Login Initiation ─────────────────────────────────────

  describe('GET /api/lti/login', () => {
    it('stores nonce and state in Redis and redirects to auth endpoint', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          id: PLATFORM_ID,
          tenant_id: TENANT_ID,
          auth_endpoint: AUTH_ENDPOINT,
        }],
      });

      const res = await request(app)
        .get('/api/lti/login')
        .query({
          iss: ISSUER,
          client_id: CLIENT_ID,
          login_hint: 'user-hint',
          target_link_uri: 'https://app.example.com/launch',
        });

      expect(res.status).toBe(302);

      // Should redirect to LMS auth endpoint
      expect(res.headers.location).toContain(AUTH_ENDPOINT);

      // Parse the redirect URL
      const redirectUrl = new URL(res.headers.location);
      expect(redirectUrl.searchParams.get('scope')).toBe('openid');
      expect(redirectUrl.searchParams.get('response_type')).toBe('id_token');
      expect(redirectUrl.searchParams.get('client_id')).toBe(CLIENT_ID);
      expect(redirectUrl.searchParams.get('login_hint')).toBe('user-hint');
      expect(redirectUrl.searchParams.get('response_mode')).toBe('form_post');
      expect(redirectUrl.searchParams.get('prompt')).toBe('none');
      expect(redirectUrl.searchParams.get('nonce')).toBeDefined();
      expect(redirectUrl.searchParams.get('state')).toBeDefined();

      // Should have stored nonce and state in Redis
      expect(mockRedis.set).toHaveBeenCalledTimes(2);

      // Nonce key
      const nonceCall = mockRedis.set.mock.calls.find(
        (call: any[]) => call[0].startsWith('lti:nonce:'),
      );
      expect(nonceCall).toBeDefined();
      expect(nonceCall![2]).toBe('EX');
      expect(nonceCall![3]).toBe(600);

      // State key
      const stateCall = mockRedis.set.mock.calls.find(
        (call: any[]) => call[0].startsWith('lti:state:'),
      );
      expect(stateCall).toBeDefined();
    });

    it('returns 400 when required parameters are missing', async () => {
      const res = await request(app)
        .get('/api/lti/login')
        .query({ iss: ISSUER });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 403 for unregistered platform', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .get('/api/lti/login')
        .query({
          iss: 'https://unknown-lms.com',
          client_id: 'unknown',
          login_hint: 'user',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('UNKNOWN_PLATFORM');
    });
  });

  // ─── 3. Launch Handler ────────────────────────────────────────────

  describe('POST /api/lti/launch', () => {
    const NONCE = 'test-nonce-123';
    const STATE = 'test-state-456';

    function setupLaunchMocks(overrides: { roles?: string[]; messageType?: string } = {}) {
      const roles = overrides.roles || ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'];
      const messageType = overrides.messageType || 'LtiResourceLinkRequest';

      // State in Redis
      mockRedis.get.mockImplementation((key: string) => {
        if (key === `lti:state:${STATE}`) {
          return Promise.resolve(JSON.stringify({
            platformId: PLATFORM_ID,
            nonce: NONCE,
            target_link_uri: 'https://app.example.com/launch?scenario_id=sc-1',
          }));
        }
        if (key === `lti:nonce:${NONCE}`) {
          return Promise.resolve(JSON.stringify({
            platformId: PLATFORM_ID,
            tenantId: TENANT_ID,
          }));
        }
        return Promise.resolve(null);
      });

      // decodeJwt (unverified decode)
      mockDecodeJwt.mockReturnValue({
        iss: ISSUER,
        sub: 'lti-user-sub',
        email: 'student@lms.com',
        name: 'Jane Student',
        nonce: NONCE,
        'https://purl.imsglobal.org/spec/lti/claim/roles': roles,
        'https://purl.imsglobal.org/spec/lti/claim/message_type': messageType,
        'https://purl.imsglobal.org/spec/lti/claim/context': { id: 'course-1', title: 'Math 101' },
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'deploy-1',
      });

      // Platform lookup
      mockDb.query.mockImplementation((text: string) => {
        if (text.includes('lti_platforms') && text.includes('WHERE id')) {
          return Promise.resolve({
            rows: [{
              id: PLATFORM_ID,
              tenant_id: TENANT_ID,
              issuer: ISSUER,
              client_id: CLIENT_ID,
              jwks_endpoint: JWKS_ENDPOINT,
            }],
          });
        }
        if (text.includes('lti_nonces')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      // jwtVerify (verified decode)
      mockCreateRemoteJWKSet.mockReturnValue('mock-jwks-fn');
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: ISSUER,
          sub: 'lti-user-sub',
          aud: CLIENT_ID,
          email: 'student@lms.com',
          name: 'Jane Student',
          nonce: NONCE,
          'https://purl.imsglobal.org/spec/lti/claim/roles': roles,
          'https://purl.imsglobal.org/spec/lti/claim/message_type': messageType,
          'https://purl.imsglobal.org/spec/lti/claim/context': { id: 'course-1', title: 'Math 101' },
          'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'deploy-1',
        },
      });

      // User upsert
      (upsertUser as jest.Mock).mockResolvedValue({
        id: USER_ID,
        tenant_id: TENANT_ID,
        email: 'student@lms.com',
        role: 'learner',
        display_name: 'Jane Student',
        is_active: true,
      });
    }

    it('validates id_token and creates user on successful launch', async () => {
      setupLaunchMocks();

      const res = await request(app)
        .post('/api/lti/launch')
        .send({ id_token: 'mock-id-token', state: STATE });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/callback#');
      expect(res.headers.location).toContain('access_token=');
      expect(res.headers.location).toContain('lti=true');

      // Should have verified the JWT
      expect(mockJwtVerify).toHaveBeenCalledWith(
        'mock-id-token',
        'mock-jwks-fn',
        { issuer: ISSUER, audience: CLIENT_ID },
      );

      // Should have consumed nonce and state
      expect(mockRedis.del).toHaveBeenCalledWith(`lti:state:${STATE}`);
      expect(mockRedis.del).toHaveBeenCalledWith(`lti:nonce:${NONCE}`);

      // Should have upserted the user
      expect(upsertUser).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          email: 'student@lms.com',
          role: 'learner',
        }),
      );
    });

    it('assigns admin role for Instructor LTI roles', async () => {
      setupLaunchMocks({
        roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      });

      const res = await request(app)
        .post('/api/lti/launch')
        .send({ id_token: 'mock-id-token', state: STATE });

      expect(res.status).toBe(302);
      expect(upsertUser).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
      );
    });

    it('returns 400 when id_token or state is missing', async () => {
      const res = await request(app)
        .post('/api/lti/launch')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });

    it('returns 403 when state is invalid or expired', async () => {
      mockRedis.get.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/lti/launch')
        .send({ id_token: 'some-token', state: 'bad-state' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INVALID_STATE');
    });

    it('returns 403 when issuer does not match platform', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('lti:state:')) {
          return Promise.resolve(JSON.stringify({
            platformId: PLATFORM_ID,
            nonce: NONCE,
          }));
        }
        return Promise.resolve(null);
      });

      mockDecodeJwt.mockReturnValue({ iss: 'https://evil-lms.com' });

      mockDb.query.mockResolvedValue({
        rows: [{
          id: PLATFORM_ID,
          tenant_id: TENANT_ID,
          issuer: ISSUER,
          client_id: CLIENT_ID,
          jwks_endpoint: JWKS_ENDPOINT,
        }],
      });

      const res = await request(app)
        .post('/api/lti/launch')
        .send({ id_token: 'spoofed-token', state: STATE });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ISSUER_MISMATCH');
    });

    it('redirects to deep linking UI for LtiDeepLinkingRequest', async () => {
      setupLaunchMocks({ messageType: 'LtiDeepLinkingRequest' });

      // Override the jwtVerify payload to include deep linking settings
      mockJwtVerify.mockResolvedValue({
        payload: {
          iss: ISSUER,
          sub: 'lti-user-sub',
          aud: CLIENT_ID,
          email: 'instructor@lms.com',
          name: 'Prof. Smith',
          nonce: NONCE,
          'https://purl.imsglobal.org/spec/lti/claim/roles': [
            'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
          ],
          'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingRequest',
          'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': {
            deep_link_return_url: 'https://lms.example.com/dl/return',
            accept_types: ['ltiResourceLink'],
            data: 'opaque-dl-data',
          },
          'https://purl.imsglobal.org/spec/lti/claim/deployment_id': 'deploy-1',
        },
      });

      (upsertUser as jest.Mock).mockResolvedValue({
        id: USER_ID,
        tenant_id: TENANT_ID,
        email: 'instructor@lms.com',
        role: 'admin',
        display_name: 'Prof. Smith',
        is_active: true,
      });

      const res = await request(app)
        .post('/api/lti/launch')
        .send({ id_token: 'dl-token', state: STATE });

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/lti/deeplinking');
      expect(res.headers.location).toContain('access_token=');
      expect(res.headers.location).toContain(`platform_id=${PLATFORM_ID}`);

      // Deep linking settings should be stored in Redis
      expect(mockRedis.set).toHaveBeenCalledWith(
        `lti:dl_settings:${USER_ID}:${PLATFORM_ID}`,
        expect.any(String),
        'EX',
        3600,
      );
    });
  });

  // ─── 4. Deep Linking Response ─────────────────────────────────────

  describe('POST /api/lti/deeplinking', () => {
    it('generates a signed JWT with content items', async () => {
      // Platform lookup
      mockDb.query.mockResolvedValue({
        rows: [{
          id: PLATFORM_ID,
          tenant_id: TENANT_ID,
          issuer: ISSUER,
          client_id: CLIENT_ID,
        }],
      });

      // Deep linking settings in Redis
      mockRedis.get.mockImplementation((key: string) => {
        if (key === `lti:dl_settings:${USER_ID}:${PLATFORM_ID}`) {
          return Promise.resolve(JSON.stringify({
            deepLinkingSettings: {
              deep_link_return_url: 'https://lms.example.com/dl/return',
              accept_types: ['ltiResourceLink'],
              data: 'opaque-dl-data',
            },
            deploymentId: 'deploy-1',
          }));
        }
        // Tenant config for tenant middleware
        if (key.startsWith('tenant:') && key.endsWith(':config')) {
          return Promise.resolve(JSON.stringify({
            id: TENANT_ID,
            slug: 'acme',
            avatar_provider: 'simli',
            max_concurrent_sessions: 10,
            session_duration_limit_sec: 3600,
            idle_timeout_sec: 300,
            is_active: true,
          }));
        }
        return Promise.resolve(null);
      });

      // Scenario lookup
      mockDb.tenantQuery.mockResolvedValue({
        rows: [{ id: 'sc-1', title: 'Patient Consultation' }],
      });

      const res = await request(app)
        .post('/api/lti/deeplinking')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          scenario_ids: ['sc-1'],
          platform_id: PLATFORM_ID,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jwt).toBe('mock-signed-jwt');
      expect(res.body.data.return_url).toBe('https://lms.example.com/dl/return');
      expect(res.body.data.content_items).toHaveLength(1);
      expect(res.body.data.content_items[0].type).toBe('ltiResourceLink');
      expect(res.body.data.content_items[0].title).toBe('Patient Consultation');

      // Should clean up DL session from Redis
      expect(mockRedis.del).toHaveBeenCalledWith(`lti:dl_settings:${USER_ID}:${PLATFORM_ID}`);
    });

    it('returns 400 when no active deep linking session exists', async () => {
      mockDb.query.mockResolvedValue({
        rows: [{
          id: PLATFORM_ID,
          tenant_id: TENANT_ID,
          issuer: ISSUER,
          client_id: CLIENT_ID,
        }],
      });

      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('tenant:') && key.endsWith(':config')) {
          return Promise.resolve(JSON.stringify({
            id: TENANT_ID, slug: 'acme', avatar_provider: 'simli',
            max_concurrent_sessions: 10, session_duration_limit_sec: 3600,
            idle_timeout_sec: 300, is_active: true,
          }));
        }
        return Promise.resolve(null);
      });

      const res = await request(app)
        .post('/api/lti/deeplinking')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ scenario_ids: ['sc-1'], platform_id: PLATFORM_ID });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_DL_SESSION');
    });

    it('returns 400 when scenario_ids or platform_id is missing', async () => {
      // Need tenant middleware to pass
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('tenant:') && key.endsWith(':config')) {
          return Promise.resolve(JSON.stringify({
            id: TENANT_ID, slug: 'acme', avatar_provider: 'simli',
            max_concurrent_sessions: 10, session_duration_limit_sec: 3600,
            idle_timeout_sec: 300, is_active: true,
          }));
        }
        return Promise.resolve(null);
      });

      const res = await request(app)
        .post('/api/lti/deeplinking')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });
  });

  // ─── 5. Grade Passback ────────────────────────────────────────────

  describe('POST /api/lti/grades/:sessionId', () => {
    const SESSION_ID = 'sess-001';

    it('sends correct score payload to LMS via AGS', async () => {
      // Tenant config
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('tenant:') && key.endsWith(':config')) {
          return Promise.resolve(JSON.stringify({
            id: TENANT_ID, slug: 'acme', avatar_provider: 'simli',
            max_concurrent_sessions: 10, session_duration_limit_sec: 3600,
            idle_timeout_sec: 300, is_active: true,
          }));
        }
        if (key === `lti:ags:${TENANT_ID}:default`) {
          return Promise.resolve(JSON.stringify({
            lineitem: 'https://lms.example.com/api/lineitem/1',
          }));
        }
        return Promise.resolve(null);
      });

      // Session with score
      mockDb.tenantQuery.mockResolvedValue({
        rows: [{
          id: SESSION_ID,
          user_id: USER_ID,
          scenario_id: 'sc-1',
          status: 'completed',
          overall_score: 87.5,
        }],
      });

      // Platform
      mockDb.query.mockResolvedValue({
        rows: [{
          id: PLATFORM_ID,
          client_id: CLIENT_ID,
          issuer: ISSUER,
          token_endpoint: TOKEN_ENDPOINT,
        }],
      });

      // Mock fetch: first call for token, second for score post
      (global as any).fetch = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'lms-access-token' }),
        })
        .mockResolvedValueOnce({ ok: true });

      const token = JWTService.signAccessToken({
        sub: USER_ID,
        tid: TENANT_ID,
        role: 'learner',
        email: 'student@lms.com',
      });

      const res = await request(app)
        .post(`/api/lti/grades/${SESSION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score_given).toBe(87.5);
      expect(res.body.data.score_of).toBe(100);
      expect(res.body.data.activity_progress).toBe('Completed');
      expect(res.body.data.grading_progress).toBe('FullyGraded');

      // Verify score was posted to the correct URL
      const fetchCalls = (global as any).fetch.mock.calls;
      expect(fetchCalls).toHaveLength(2);

      // Token endpoint call
      expect(fetchCalls[0][0]).toBe(TOKEN_ENDPOINT);

      // Score post call
      expect(fetchCalls[1][0]).toBe('https://lms.example.com/api/lineitem/1/scores');
      expect(fetchCalls[1][1].headers['Content-Type']).toBe('application/vnd.ims.lis.v1.score+json');
      expect(fetchCalls[1][1].headers.Authorization).toBe('Bearer lms-access-token');
    });

    it('returns 404 when session is not found', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('tenant:') && key.endsWith(':config')) {
          return Promise.resolve(JSON.stringify({
            id: TENANT_ID, slug: 'acme', avatar_provider: 'simli',
            max_concurrent_sessions: 10, session_duration_limit_sec: 3600,
            idle_timeout_sec: 300, is_active: true,
          }));
        }
        return Promise.resolve(null);
      });

      mockDb.tenantQuery.mockResolvedValue({ rows: [] });

      const token = JWTService.signAccessToken({
        sub: USER_ID,
        tid: TENANT_ID,
        role: 'learner',
        email: 'student@lms.com',
      });

      const res = await request(app)
        .post('/api/lti/grades/nonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('returns 400 when session is not completed', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('tenant:') && key.endsWith(':config')) {
          return Promise.resolve(JSON.stringify({
            id: TENANT_ID, slug: 'acme', avatar_provider: 'simli',
            max_concurrent_sessions: 10, session_duration_limit_sec: 3600,
            idle_timeout_sec: 300, is_active: true,
          }));
        }
        return Promise.resolve(null);
      });

      mockDb.tenantQuery.mockResolvedValue({
        rows: [{ id: SESSION_ID, user_id: USER_ID, scenario_id: 'sc-1', status: 'active', overall_score: null }],
      });

      const token = JWTService.signAccessToken({
        sub: USER_ID,
        tid: TENANT_ID,
        role: 'learner',
        email: 'student@lms.com',
      });

      const res = await request(app)
        .post(`/api/lti/grades/${SESSION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SESSION_INCOMPLETE');
    });

    it('returns 400 when no AGS endpoint is available', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.startsWith('tenant:') && key.endsWith(':config')) {
          return Promise.resolve(JSON.stringify({
            id: TENANT_ID, slug: 'acme', avatar_provider: 'simli',
            max_concurrent_sessions: 10, session_duration_limit_sec: 3600,
            idle_timeout_sec: 300, is_active: true,
          }));
        }
        return Promise.resolve(null); // no AGS endpoint
      });

      mockDb.tenantQuery.mockResolvedValue({
        rows: [{ id: SESSION_ID, user_id: USER_ID, scenario_id: 'sc-1', status: 'completed', overall_score: 90 }],
      });

      mockDb.query.mockResolvedValue({
        rows: [{ id: PLATFORM_ID, client_id: CLIENT_ID, issuer: ISSUER, token_endpoint: TOKEN_ENDPOINT }],
      });

      const token = JWTService.signAccessToken({
        sub: USER_ID,
        tid: TENANT_ID,
        role: 'learner',
        email: 'student@lms.com',
      });

      const res = await request(app)
        .post(`/api/lti/grades/${SESSION_ID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_AGS');
    });
  });
});

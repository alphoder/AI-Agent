import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Generate RSA key pair for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that touches them
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
  set: jest.fn(),
  del: jest.fn(),
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

const mockSSOAdapter = {
  getLoginUrl: jest.fn(),
  validateCallback: jest.fn(),
};

jest.mock('../../services/sso-adapter', () => ({
  SSOAdapter: mockSSOAdapter,
}));

jest.mock('../../services/user-service', () => ({
  upsertUser: jest.fn(),
}));

jest.mock('../../middleware/request-logger', () => ({
  requestLogger: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../middleware/metrics', () => ({
  metricsMiddleware: (_req: any, _res: any, next: any) => next(),
  metricsHandler: (_req: any, res: any) => res.json({}),
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

// ---------------------------------------------------------------------------
// Imports (after all mocks)
// ---------------------------------------------------------------------------

import request from 'supertest';
import { createApp } from '../../app';
import { JWTService } from '../../services/jwt-service';
import { upsertUser } from '../../services/user-service';

const app = createApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_TENANT_SLUG = 'acme';
const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEST_USER = {
  id: '22222222-2222-2222-2222-222222222222',
  tenant_id: TEST_TENANT_ID,
  email: 'jane@acme.com',
  display_name: 'Jane Doe',
  role: 'admin' as const,
  is_active: true,
  last_login_at: new Date().toISOString(),
  metadata: {},
};

function signTestToken(overrides: Partial<{ sub: string; tid: string; role: string; email: string; exp: number }> = {}) {
  return JWTService.signAccessToken({
    sub: TEST_USER.id,
    tid: TEST_TENANT_ID,
    role: 'admin',
    email: TEST_USER.email,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1);
  });

  // ─── SSO Init ──────────────────────────────────────────────────────

  describe('GET /api/auth/sso/init', () => {
    it('returns 400 when tenant slug is missing', async () => {
      const res = await request(app).get('/api/auth/sso/init');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MISSING_TENANT');
    });

    it('redirects to IdP with correct parameters', async () => {
      mockSSOAdapter.getLoginUrl.mockResolvedValue({
        url: 'https://idp.acme.com/saml/login?SAMLRequest=abc',
        tenantId: TEST_TENANT_ID,
        provider: 'saml',
      });

      const res = await request(app)
        .get('/api/auth/sso/init')
        .query({ tenant: TEST_TENANT_SLUG });

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://idp.acme.com/saml/login?SAMLRequest=abc');

      expect(mockSSOAdapter.getLoginUrl).toHaveBeenCalledWith(
        TEST_TENANT_SLUG,
        expect.stringContaining('/api/auth/sso/callback'),
      );
    });
  });

  // ─── SSO Callback ─────────────────────────────────────────────────

  describe('POST /api/auth/sso/callback', () => {
    it('returns 400 when tenant cannot be determined', async () => {
      const res = await request(app)
        .post('/api/auth/sso/callback')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('MISSING_TENANT');
    });

    it('creates user and issues tokens on valid callback', async () => {
      mockSSOAdapter.validateCallback.mockResolvedValue({
        email: TEST_USER.email,
        externalId: 'ext-123',
        displayName: TEST_USER.display_name,
        groups: ['Admins'],
        rawAttributes: {},
      });

      mockDb.query.mockResolvedValue({
        rows: [{
          id: TEST_TENANT_ID,
          sso_config: { role_mapping: { source_field: 'groups', admin_values: ['Admins'] } },
        }],
      });

      (upsertUser as jest.Mock).mockResolvedValue(TEST_USER);
      mockRedis.set.mockResolvedValue('OK');

      const res = await request(app)
        .post('/api/auth/sso/callback')
        .send({ RelayState: TEST_TENANT_SLUG, SAMLResponse: 'base64data' });

      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/callback#access_token=/);

      // Should have set a refresh token cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const refreshCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.includes('refresh_token'))
        : cookies;
      expect(refreshCookie).toContain('refresh_token');
      expect(refreshCookie).toContain('HttpOnly');

      expect(upsertUser).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TEST_TENANT_ID,
          email: TEST_USER.email,
        }),
      );
    });
  });

  // ─── Refresh Token Rotation ────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('returns 401 when no refresh token cookie is present', async () => {
      const res = await request(app).post('/api/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
    });

    it('rotates tokens successfully with valid refresh token', async () => {
      const storedData = JSON.stringify({
        userId: TEST_USER.id,
        tenantId: TEST_TENANT_ID,
        tokenFamily: 'family-abc',
        createdAt: Date.now(),
      });

      mockRedis.get
        .mockResolvedValueOnce(storedData) // stored token data
        .mockResolvedValueOnce(null);       // family not revoked
      mockRedis.del.mockResolvedValue(1);
      mockRedis.set.mockResolvedValue('OK');

      mockDb.query.mockResolvedValue({
        rows: [{ id: TEST_USER.id, tenant_id: TEST_TENANT_ID, role: 'admin', email: TEST_USER.email }],
      });

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=valid-refresh-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();

      // Old token should have been deleted
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:valid-refresh-token');
    });

    it('returns 401 and clears cookie for invalid refresh token', async () => {
      mockRedis.get.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=bogus-token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });
  });

  // ─── Logout ────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('revokes refresh token and clears cookie', async () => {
      mockRedis.del.mockResolvedValue(1);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', 'refresh_token=some-refresh-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out');

      expect(mockRedis.del).toHaveBeenCalledWith('refresh:some-refresh-token');
    });

    it('succeeds even when no refresh token cookie is present', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── GET /me ───────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('returns user info with a valid access token', async () => {
      const accessToken = signTestToken();

      mockDb.query.mockResolvedValue({ rows: [TEST_USER] });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(TEST_USER.email);
      expect(res.body.data.id).toBe(TEST_USER.id);
    });

    it('returns 401 when no Authorization header is provided', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when token is expired', async () => {
      const expiredToken = jwt.sign(
        { sub: TEST_USER.id, tid: TEST_TENANT_ID, role: 'admin', email: TEST_USER.email },
        privateKey,
        { algorithm: 'RS256', expiresIn: '0s', issuer: 'avatar-platform' },
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    });

    it('returns 401 when token is signed with wrong key', async () => {
      const { privateKey: wrongKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const badToken = jwt.sign(
        { sub: TEST_USER.id, tid: TEST_TENANT_ID, role: 'admin', email: TEST_USER.email },
        wrongKey,
        { algorithm: 'RS256', expiresIn: '15m', issuer: 'avatar-platform' },
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${badToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });

    it('returns 404 when user no longer exists in database', async () => {
      const accessToken = signTestToken();
      mockDb.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });
  });
});

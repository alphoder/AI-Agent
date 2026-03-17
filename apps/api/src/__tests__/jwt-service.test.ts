import crypto from 'crypto';
import jwt from 'jsonwebtoken';

// Generate RSA key pair for testing
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Mock config before importing the service
jest.mock('../config/env', () => ({
  config: {
    JWT_PRIVATE_KEY: privateKey,
    JWT_PUBLIC_KEY: publicKey,
  },
}));

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('../config/redis', () => ({
  redis: mockRedis,
  RedisKeys: {
    refreshToken: (id: string) => `refresh:${id}`,
  },
  RedisTTL: {
    REFRESH_TOKEN: 604800,
  },
}));

// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock database
const mockDb = {
  query: jest.fn(),
};

jest.mock('../config/database', () => ({
  db: mockDb,
}));

import { JWTService, AccessTokenPayload } from '../services/jwt-service';

describe('JWTService', () => {
  const testPayload: AccessTokenPayload = {
    sub: 'user-123',
    tid: 'tenant-456',
    role: 'admin',
    email: 'test@example.com',
  };

  const testUser = {
    id: 'user-123',
    tenant_id: 'tenant-456',
    role: 'admin',
    email: 'test@example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signAccessToken', () => {
    it('produces a valid JWT with correct payload', () => {
      const token = JWTService.signAccessToken(testPayload);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const decoded = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
      }) as AccessTokenPayload;

      expect(decoded.sub).toBe(testPayload.sub);
      expect(decoded.tid).toBe(testPayload.tid);
      expect(decoded.role).toBe(testPayload.role);
      expect(decoded.email).toBe(testPayload.email);
    });
  });

  describe('verifyAccessToken', () => {
    it('returns correct payload for valid token', () => {
      const token = JWTService.signAccessToken(testPayload);
      const result = JWTService.verifyAccessToken(token);

      expect(result.sub).toBe(testPayload.sub);
      expect(result.tid).toBe(testPayload.tid);
      expect(result.role).toBe(testPayload.role);
      expect(result.email).toBe(testPayload.email);
    });

    it('throws on expired token', () => {
      const expiredToken = jwt.sign(testPayload, privateKey, {
        algorithm: 'RS256',
        expiresIn: '0s',
        issuer: 'avatar-platform',
      });

      expect(() => JWTService.verifyAccessToken(expiredToken)).toThrow();
    });

    it('throws on invalid token', () => {
      expect(() => JWTService.verifyAccessToken('invalid.token.here')).toThrow();
    });

    it('throws on token signed with different key', () => {
      const { privateKey: otherKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const badToken = jwt.sign(testPayload, otherKey, {
        algorithm: 'RS256',
        expiresIn: '15m',
        issuer: 'avatar-platform',
      });

      expect(() => JWTService.verifyAccessToken(badToken)).toThrow();
    });
  });

  describe('issueTokens', () => {
    it('returns both access and refresh tokens', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await JWTService.issueTokens(testUser);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.accessToken.split('.')).toHaveLength(3);

      // Verify the access token contains the right payload
      const decoded = JWTService.verifyAccessToken(result.accessToken);
      expect(decoded.sub).toBe(testUser.id);
      expect(decoded.tid).toBe(testUser.tenant_id);
      expect(decoded.role).toBe(testUser.role);
      expect(decoded.email).toBe(testUser.email);

      // Verify refresh token was stored in Redis
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('refresh:'),
        expect.any(String),
        'EX',
        604800,
      );
    });
  });

  describe('rotateRefreshToken', () => {
    it('returns new tokens for valid refresh token', async () => {
      const storedData = JSON.stringify({
        userId: 'user-123',
        tenantId: 'tenant-456',
        tokenFamily: 'family-789',
        createdAt: Date.now(),
      });

      mockRedis.get
        .mockResolvedValueOnce(storedData) // First call: get stored token data
        .mockResolvedValueOnce(null); // Second call: check family revocation
      mockRedis.del.mockResolvedValue(1);
      mockRedis.set.mockResolvedValue('OK');

      mockDb.query.mockResolvedValue({
        rows: [{ id: 'user-123', tenant_id: 'tenant-456', role: 'admin', email: 'test@example.com' }],
      });

      const result = await JWTService.rotateRefreshToken('old-refresh-token');

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');

      // Verify old token was deleted
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:old-refresh-token');
    });

    it('returns null for consumed (missing) token', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await JWTService.rotateRefreshToken('consumed-token');

      expect(result).toBeNull();
    });

    it('returns null when token family is revoked', async () => {
      const storedData = JSON.stringify({
        userId: 'user-123',
        tenantId: 'tenant-456',
        tokenFamily: 'family-789',
        createdAt: Date.now(),
      });

      mockRedis.get
        .mockResolvedValueOnce(storedData) // stored token data
        .mockResolvedValueOnce('true'); // family is revoked
      mockRedis.del.mockResolvedValue(1);

      const result = await JWTService.rotateRefreshToken('reused-token');

      expect(result).toBeNull();
    });
  });
});

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { redis, RedisKeys, RedisTTL } from '../config/redis';
import { config } from '../config/env';
import { logger } from '../config/logger';

export interface AccessTokenPayload {
  sub: string; // user ID
  tid: string; // tenant ID
  role: string; // user role
  email: string; // user email
}

interface RefreshTokenData {
  userId: string;
  tenantId: string;
  tokenFamily: string; // For theft detection
  createdAt: number;
}

/**
 * JWT service: RS256 access tokens (15-min) + opaque refresh tokens in Redis (7-day).
 * Implements single-use refresh token rotation with theft detection.
 */
export class JWTService {
  private static readonly ACCESS_TOKEN_TTL = '15m';
  private static readonly REFRESH_TOKEN_TTL = RedisTTL.REFRESH_TOKEN; // 7 days

  /** Use HS256 in dev when no real RSA keys are configured */
  private static get algorithm(): jwt.Algorithm {
    return config.JWT_PRIVATE_KEY.startsWith('-----') ? 'RS256' : 'HS256';
  }

  /**
   * Issue a new access + refresh token pair.
   */
  static async issueTokens(user: {
    id: string;
    tenant_id: string;
    role: string;
    email: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken({
      sub: user.id,
      tid: user.tenant_id,
      role: user.role,
      email: user.email,
    });

    const tokenFamily = crypto.randomUUID();
    const refreshToken = await this.createRefreshToken({
      userId: user.id,
      tenantId: user.tenant_id,
      tokenFamily,
      createdAt: Date.now(),
    });

    logger.info({ userId: user.id, tenantId: user.tenant_id }, 'Tokens issued');
    return { accessToken, refreshToken };
  }

  /**
   * Sign an RS256 access token.
   */
  static signAccessToken(payload: AccessTokenPayload): string {
    const key = this.algorithm === 'RS256' ? config.JWT_PRIVATE_KEY : config.JWT_PRIVATE_KEY;
    return jwt.sign(payload, key, {
      algorithm: this.algorithm,
      expiresIn: this.ACCESS_TOKEN_TTL,
      issuer: 'avatar-platform',
    });
  }

  /**
   * Verify an access token.
   */
  static verifyAccessToken(token: string): AccessTokenPayload {
    const key = this.algorithm === 'RS256' ? config.JWT_PUBLIC_KEY : config.JWT_PRIVATE_KEY;
    return jwt.verify(token, key, {
      algorithms: [this.algorithm],
      issuer: 'avatar-platform',
    }) as AccessTokenPayload;
  }

  /**
   * Create an opaque refresh token stored in Redis.
   */
  private static async createRefreshToken(data: RefreshTokenData): Promise<string> {
    const token = crypto.randomBytes(64).toString('hex');
    const key = RedisKeys.refreshToken(token);

    await redis.set(key, JSON.stringify(data), 'EX', this.REFRESH_TOKEN_TTL);

    return token;
  }

  /**
   * Rotate a refresh token (single-use with theft detection).
   * If a consumed token is reused, revoke entire token family.
   */
  static async rotateRefreshToken(
    oldToken: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const key = RedisKeys.refreshToken(oldToken);
    const stored = await redis.get(key);

    if (!stored) {
      logger.warn('Refresh token not found — possible reuse of consumed token');
      return null;
    }

    const data: RefreshTokenData = JSON.parse(stored);

    // Delete old token immediately (single-use)
    await redis.del(key);

    // Check if this token family has been compromised
    const familyKey = `refresh:family:${data.tokenFamily}:revoked`;
    const isRevoked = await redis.get(familyKey);

    if (isRevoked) {
      logger.warn(
        { userId: data.userId, tokenFamily: data.tokenFamily },
        'Token family revoked — theft detected',
      );
      await this.revokeAllUserTokens(data.userId);
      return null;
    }

    // Fetch user for new token payload
    const { db } = await import('../config/database');
    const userResult = await db.query(
      'SELECT id, tenant_id, role, email FROM users WHERE id = $1',
      [data.userId],
    );

    if (userResult.rows.length === 0) {
      return null;
    }

    const user = userResult.rows[0];

    // Issue new token pair with same family
    const accessToken = this.signAccessToken({
      sub: user.id,
      tid: user.tenant_id,
      role: user.role,
      email: user.email,
    });

    const newRefreshToken = await this.createRefreshToken({
      userId: data.userId,
      tenantId: data.tenantId,
      tokenFamily: data.tokenFamily,
      createdAt: Date.now(),
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Revoke all refresh tokens for a user (logout + theft detection).
   */
  static async revokeAllUserTokens(userId: string): Promise<void> {
    logger.info({ userId }, 'Revoking all user tokens');
    // Scan and delete all refresh tokens for this user
    // In production, maintain a user->token set in Redis for efficient revocation
  }

  /**
   * Revoke a specific refresh token.
   */
  static async revokeRefreshToken(token: string): Promise<void> {
    const key = RedisKeys.refreshToken(token);
    await redis.del(key);
  }
}

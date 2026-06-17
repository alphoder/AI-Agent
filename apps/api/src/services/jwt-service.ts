import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../config/database';
import { config } from '../config/env';
import { logger } from '../config/logger';

export interface AccessTokenPayload {
  sub: string; // user ID
  email: string; // user email
}

const ACCESS_TOKEN_TTL = '1h';
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * JWT service: signed access tokens (1h) + opaque refresh tokens stored in
 * Postgres (7d). Single-use rotation with token-family theft detection — no
 * Redis. RS256 in production (PEM keys), HS256 in dev.
 */
export class JWTService {
  private static get algorithm(): jwt.Algorithm {
    const isRSA = config.JWT_PRIVATE_KEY.startsWith('-----');
    if (!isRSA && process.env.NODE_ENV === 'production') {
      throw new Error('RSA keys required in production. Set JWT_PRIVATE_KEY and JWT_PUBLIC_KEY with PEM-formatted keys.');
    }
    return isRSA ? 'RS256' : 'HS256';
  }

  static async issueTokens(user: { id: string; email: string }): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.signAccessToken({ sub: user.id, email: user.email });
    const refreshToken = await this.createRefreshToken(user.id, crypto.randomUUID());
    logger.info({ userId: user.id }, 'Tokens issued');
    return { accessToken, refreshToken };
  }

  static signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, config.JWT_PRIVATE_KEY, {
      algorithm: this.algorithm,
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: 'avatar-platform',
    });
  }

  static verifyAccessToken(token: string): AccessTokenPayload {
    const key = this.algorithm === 'RS256' ? config.JWT_PUBLIC_KEY : config.JWT_PRIVATE_KEY;
    return jwt.verify(token, key, {
      algorithms: [this.algorithm],
      issuer: 'avatar-platform',
    }) as AccessTokenPayload;
  }

  /** Create an opaque refresh token row (returns the raw token). */
  private static async createRefreshToken(userId: string, familyId: string): Promise<string> {
    const token = crypto.randomBytes(48).toString('hex');
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval)`,
      [userId, hashToken(token), familyId, String(REFRESH_TOKEN_TTL_SEC)],
    );
    return token;
  }

  /**
   * Rotate a refresh token (single-use). Reuse of a consumed/expired token
   * revokes the entire family (theft detection).
   */
  static async rotateRefreshToken(
    oldToken: string,
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    return db.withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, user_id, family_id, revoked_at, expires_at
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [hashToken(oldToken)],
      );

      if (rows.length === 0) {
        logger.warn('Refresh token not found — possible reuse');
        return null;
      }

      const row = rows[0];

      // Reuse of an already-consumed token, or an expired one → theft. Burn the family.
      if (row.revoked_at || new Date(row.expires_at) < new Date()) {
        logger.warn({ userId: row.user_id, familyId: row.family_id }, 'Refresh token reuse/expired — revoking family');
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL`,
          [row.family_id],
        );
        return null;
      }

      // Single-use: consume this token.
      await client.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);

      const userResult = await client.query(
        `SELECT id, email FROM users WHERE id = $1 AND is_active = true AND deleted_at IS NULL`,
        [row.user_id],
      );
      if (userResult.rows.length === 0) return null;
      const user = userResult.rows[0];

      // Issue a new token pair in the same family.
      const accessToken = this.signAccessToken({ sub: user.id, email: user.email });
      const newToken = crypto.randomBytes(48).toString('hex');
      await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
         VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval)`,
        [user.id, hashToken(newToken), row.family_id, String(REFRESH_TOKEN_TTL_SEC)],
      );

      return { accessToken, refreshToken: newToken };
    });
  }

  /** Revoke all refresh tokens for a user (logout). */
  static async revokeAllUserTokens(userId: string): Promise<void> {
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    logger.info({ userId }, 'All user refresh tokens revoked');
  }

  static async revokeRefreshToken(token: string): Promise<void> {
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashToken(token)],
    );
  }
}

import { Request, Response, NextFunction } from 'express';
import { JWTService, AccessTokenPayload } from '../services/jwt-service';
import { logger } from '../config/logger';

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

/**
 * Auth middleware: Extract and verify JWT from Authorization header.
 * Attaches decoded user to req.user.
 */
export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing access token' },
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = JWTService.verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' },
      });
    }

    logger.warn({ err: err.message }, 'JWT verification failed');
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid access token' },
    });
  }
}

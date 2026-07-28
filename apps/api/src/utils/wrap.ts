import { Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';

type AuthHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Async route adapter. Express 4 does not catch promise rejections, and the old
 * per-file `wrap` was a bare type cast — one thrown DB error anywhere took the
 * whole API process down (it happened: a not-null violation on POST /scenarios
 * killed the server). Every rejection now lands in the errorHandler middleware.
 */
export const wrap = (fn: AuthHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };

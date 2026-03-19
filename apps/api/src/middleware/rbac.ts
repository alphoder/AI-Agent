import { Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest } from './auth';

export function rbac(...allowedRoles: string[]): RequestHandler {
  return ((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  }) as unknown as RequestHandler;
}

export function rbacOwnerOrAdmin(userIdParam: string = 'id'): RequestHandler {
  return ((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    }
    if (req.user.role === 'admin' || req.user.sub === req.params[userIdParam]) {
      return next();
    }
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
  }) as unknown as RequestHandler;
}

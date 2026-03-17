import { Response, NextFunction } from 'express';
import { rbac, rbacOwnerOrAdmin } from '../middleware/rbac';
import { AuthenticatedRequest } from '../middleware/auth';

function createMockReq(user?: { sub: string; tid: string; role: string; email: string }, params?: Record<string, string>): AuthenticatedRequest {
  return {
    user,
    params: params || {},
  } as unknown as AuthenticatedRequest;
}

function createMockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('rbac middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  describe('rbac()', () => {
    it('allows admin users when admin role is required', () => {
      const req = createMockReq({ sub: 'u1', tid: 't1', role: 'admin', email: 'a@b.com' });
      const res = createMockRes();

      rbac('admin')(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('blocks learner users when only admin role is allowed', () => {
      const req = createMockReq({ sub: 'u1', tid: 't1', role: 'learner', email: 'a@b.com' });
      const res = createMockRes();

      rbac('admin')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({ code: 'FORBIDDEN' }),
        }),
      );
    });

    it('allows both admin and learner when both roles specified', () => {
      const adminReq = createMockReq({ sub: 'u1', tid: 't1', role: 'admin', email: 'a@b.com' });
      const learnerReq = createMockReq({ sub: 'u2', tid: 't1', role: 'learner', email: 'l@b.com' });
      const res1 = createMockRes();
      const res2 = createMockRes();
      const next1 = jest.fn();
      const next2 = jest.fn();

      rbac('admin', 'learner')(adminReq, res1, next1);
      rbac('admin', 'learner')(learnerReq, res2, next2);

      expect(next1).toHaveBeenCalled();
      expect(next2).toHaveBeenCalled();
    });

    it('returns 401 when user is not authenticated', () => {
      const req = createMockReq(undefined);
      const res = createMockRes();

      rbac('admin')(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('rbacOwnerOrAdmin()', () => {
    it('allows admin regardless of ownership', () => {
      const req = createMockReq(
        { sub: 'admin-user', tid: 't1', role: 'admin', email: 'a@b.com' },
        { id: 'other-user' },
      );
      const res = createMockRes();

      rbacOwnerOrAdmin()(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('allows owner (non-admin) when sub matches param id', () => {
      const req = createMockReq(
        { sub: 'user-123', tid: 't1', role: 'learner', email: 'l@b.com' },
        { id: 'user-123' },
      );
      const res = createMockRes();

      rbacOwnerOrAdmin()(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('blocks non-owner non-admin', () => {
      const req = createMockReq(
        { sub: 'user-123', tid: 't1', role: 'learner', email: 'l@b.com' },
        { id: 'other-user' },
      );
      const res = createMockRes();

      rbacOwnerOrAdmin()(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 401 when user is not authenticated', () => {
      const req = createMockReq(undefined, { id: 'user-123' });
      const res = createMockRes();

      rbacOwnerOrAdmin()(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('uses custom userIdParam', () => {
      const req = createMockReq(
        { sub: 'user-123', tid: 't1', role: 'learner', email: 'l@b.com' },
        { userId: 'user-123' },
      );
      const res = createMockRes();

      rbacOwnerOrAdmin('userId')(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});

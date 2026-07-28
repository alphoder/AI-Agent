import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { db } from '../config/database';
import { ensureWallet, walletEnforced } from '../services/wallet-service';


const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

/**
 * GET /api/wallet — balance + recent ledger. `unlimited` is true during beta
 * (WALLET_ENFORCE off): the UI shows ∞ and hides top-ups.
 */
router.get('/', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const balance = await ensureWallet(me);
  const txns = await db.query(
    `SELECT delta_seconds, reason, ref, created_at
     FROM wallet_transactions WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 20`,
    [me],
  );
  res.json({
    success: true,
    data: { balance_seconds: balance, unlimited: !walletEnforced(), transactions: txns.rows },
  });
}));

export const walletRoutes: Router = router;

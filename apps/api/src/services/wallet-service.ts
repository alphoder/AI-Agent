import { db } from '../config/database';

/** Prepaid practice minutes, stored as seconds. During beta WALLET_ENFORCE is
 *  off: balances are informational (can go negative), nothing ever blocks —
 *  flipping WALLET_ENFORCE=true turns on real metering with zero code changes. */

export const STARTER_SECONDS = 900; // 15 free minutes on first touch

export const walletEnforced = (): boolean => process.env.WALLET_ENFORCE === 'true';

/** Get the balance, creating the wallet (with the starter grant) on first touch. */
export async function ensureWallet(userId: string): Promise<number> {
  const existing = await db.query('SELECT balance_seconds FROM wallets WHERE user_id = $1', [userId]);
  if (existing.rows.length > 0) return existing.rows[0].balance_seconds;
  await db.query('INSERT INTO wallets (user_id, balance_seconds) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [userId, STARTER_SECONDS]);
  await db.query(
    `INSERT INTO wallet_transactions (user_id, delta_seconds, reason) VALUES ($1, $2, 'starter')`,
    [userId, STARTER_SECONDS],
  );
  return STARTER_SECONDS;
}

/** Atomically apply a credit/debit and record it. Returns the new balance. */
export async function adjustWallet(userId: string, deltaSeconds: number, reason: string, ref?: string): Promise<number> {
  const r = await db.query(
    'UPDATE wallets SET balance_seconds = balance_seconds + $2, updated_at = NOW() WHERE user_id = $1 RETURNING balance_seconds',
    [userId, deltaSeconds],
  );
  await db.query(
    'INSERT INTO wallet_transactions (user_id, delta_seconds, reason, ref) VALUES ($1, $2, $3, $4)',
    [userId, deltaSeconds, reason, ref ?? null],
  );
  return r.rows[0]?.balance_seconds ?? 0;
}

import { db } from '../config/database';
import { logger } from '../config/logger';

interface UpsertUserParams {
  tenantId: string;
  email: string;
  externalId: string;
  displayName: string;
  role: 'admin' | 'learner';
}

/**
 * Upsert a user on SSO login — create if new, update last_login if existing.
 */
export async function upsertUser(params: UpsertUserParams) {
  const { tenantId, email, externalId, displayName, role } = params;

  const result = await db.query(
    `INSERT INTO users (tenant_id, email, external_id, display_name, role, last_login_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (tenant_id, email) DO UPDATE SET
       external_id = COALESCE(EXCLUDED.external_id, users.external_id),
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       last_login_at = NOW(),
       updated_at = NOW()
     RETURNING id, tenant_id, email, display_name, role, is_active`,
    [tenantId, email, externalId, displayName, role],
  );

  const user = result.rows[0];

  if (!user.is_active) {
    logger.warn({ userId: user.id, email }, 'Inactive user attempted login');
    throw new Error('User account is inactive');
  }

  logger.info({ userId: user.id, email, role }, 'User upserted on login');

  return user;
}

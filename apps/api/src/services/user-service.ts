import { db } from '../config/database';
import { logger } from '../config/logger';
import type { GoogleProfile } from './google-auth';

/**
 * Upsert a user on Google login. Matches on google_sub first, then email
 * (so a user who previously existed by email gets their google_sub linked).
 */
export async function upsertGoogleUser(profile: GoogleProfile) {
  const result = await db.query(
    `INSERT INTO users (google_sub, email, name, picture, last_login_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (email) WHERE deleted_at IS NULL DO UPDATE SET
       google_sub = COALESCE(users.google_sub, EXCLUDED.google_sub),
       name = COALESCE(EXCLUDED.name, users.name),
       picture = COALESCE(EXCLUDED.picture, users.picture),
       last_login_at = NOW(),
       updated_at = NOW()
     RETURNING id, email, name, picture, is_active`,
    [profile.sub, profile.email, profile.name, profile.picture],
  );

  const user = result.rows[0];
  if (!user.is_active) {
    logger.warn({ userId: user.id, email: profile.email }, 'Inactive user attempted login');
    throw new Error('User account is inactive');
  }
  logger.info({ userId: user.id, email: profile.email }, 'User upserted on Google login');
  return user;
}

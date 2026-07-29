import { Router, Response, RequestHandler } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { wrap } from '../utils/wrap';
import { rateLimit } from '../middleware/rate-limit';
import { db } from '../config/database';
import { getStreak, getXp } from '../services/game-service';
import { INTAKE_IDS, INDIAN_STATES } from '@avatar-platform/shared';

const router: Router = Router();
router.use(authMiddleware as unknown as RequestHandler);

const MAX_NAME = 40;
const MAX_FIELD = 60;

/**
 * Sanitise a public-facing string. The display name and the org/city/state all
 * appear on competition boards next to other people, so they are cleaned on the
 * way in rather than trusted or escaped later.
 */
export function clean(value: unknown, max: number): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** GET /api/profile — who I am, where I practise, and my lifetime numbers. */
router.get('/', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;

  const [user, totals, certs, streak, xp] = await Promise.all([
    db.query(
      `SELECT id, email, name, picture, created_at,
              COALESCE(metadata->'profile', '{}'::jsonb) AS profile,
              COALESCE(metadata->'intake', '{}'::jsonb)  AS intake
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [me],
    ),
    db.query(
      `SELECT COUNT(*)::int AS calls,
              COALESCE(SUM(s.duration_sec), 0)::int AS seconds,
              MAX(sc.overall_score)::float AS best
         FROM sessions s
         LEFT JOIN session_scores sc ON sc.session_id = s.id
        WHERE s.user_id = $1 AND s.status = 'completed'`,
      [me],
    ),
    db.query('SELECT unit_key, issued_at FROM certificates WHERE user_id = $1 ORDER BY issued_at DESC', [me]),
    getStreak(me),
    getXp(me),
  ]);

  if (user.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }
  const u = user.rows[0];
  const t = totals.rows[0];

  res.json({
    success: true,
    data: {
      id: u.id,
      email: u.email,
      name: u.name,
      picture: u.picture,
      memberSince: u.created_at,
      profile: {
        org: u.profile.org ?? '',
        city: u.profile.city ?? '',
        state: u.profile.state ?? '',
        // Role and industry default to whatever the intake captured.
        role: u.profile.role ?? u.intake.role ?? '',
        industry: u.profile.industry ?? u.intake.industry ?? '',
      },
      stats: {
        calls: t.calls,
        minutes: Math.round((t.seconds ?? 0) / 60),
        best: t.best != null ? Math.round(t.best) : null,
        streak,
        xp,
      },
      certificates: certs.rows,
    },
  });
}));

/**
 * PATCH /api/profile — display name and where I practise from.
 * Every field here is publicly visible on a competition board.
 */
router.patch('/', rateLimit(30), wrap(async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!.sub;
  const b = req.body ?? {};

  const profilePatch: Record<string, string> = {};
  for (const key of ['org', 'city'] as const) {
    if (b[key] !== undefined) profilePatch[key] = clean(b[key], MAX_FIELD);
  }
  if (b.state !== undefined) {
    const state = clean(b.state, MAX_FIELD);
    // A free-typed state would split one board in two; only known values count.
    profilePatch.state = INDIAN_STATES.includes(state) ? state : '';
  }
  if (b.role !== undefined) {
    const role = clean(b.role, MAX_FIELD);
    profilePatch.role = INTAKE_IDS.role.includes(role) ? role : '';
  }
  if (b.industry !== undefined) {
    const industry = clean(b.industry, MAX_FIELD);
    profilePatch.industry = INTAKE_IDS.industry.includes(industry) ? industry : '';
  }

  const name = b.name !== undefined ? clean(b.name, MAX_NAME) : undefined;
  if (name !== undefined && name.length === 0) {
    return res.status(400).json({ success: false, error: { code: 'NAME_REQUIRED', message: 'Your name cannot be empty.' } });
  }
  if (name === undefined && Object.keys(profilePatch).length === 0) {
    return res.status(400).json({ success: false, error: { code: 'NOTHING_TO_UPDATE', message: 'Nothing to update.' } });
  }

  const result = await db.query(
    `UPDATE users
        SET name = COALESCE($2, name),
            metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{profile}',
                  COALESCE(metadata->'profile', '{}'::jsonb) || $3::jsonb, true),
            updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING name, COALESCE(metadata->'profile', '{}'::jsonb) AS profile`,
    [me, name ?? null, JSON.stringify(profilePatch)],
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }
  res.json({ success: true, data: result.rows[0] });
}));

export const profileRoutes: Router = router;
export const __test = { clean };

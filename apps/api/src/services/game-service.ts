import { db } from '../config/database';

/** Consecutive practice days ending today (or yesterday, so a streak isn't
 *  "broken" before the user has had today to practise). Computed on read from
 *  session history — no counters to maintain. */
export async function getStreak(userId: string): Promise<number> {
  const r = await db.query(
    `SELECT DISTINCT date_trunc('day', created_at)::date AS d
     FROM sessions WHERE user_id = $1 AND created_at > NOW() - INTERVAL '90 days'
     ORDER BY d DESC`,
    [userId],
  );
  const days = new Set(r.rows.map((x) => new Date(x.d).toISOString().slice(0, 10)));
  const key = (offset: number) => {
    const d = new Date(); d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  let offset = days.has(key(0)) ? 0 : days.has(key(1)) ? 1 : -1;
  if (offset === -1) return 0;
  let streak = 0;
  while (days.has(key(offset + streak))) streak++;
  return streak;
}

/** Total XP: the sum of every scored call's score. Simple, monotonic, honest. */
export async function getXp(userId: string): Promise<number> {
  const r = await db.query(
    `SELECT COALESCE(SUM(ROUND(sc.overall_score)), 0)::int AS xp
     FROM session_scores sc JOIN sessions s ON s.id = sc.session_id
     WHERE s.user_id = $1`,
    [userId],
  );
  return r.rows[0].xp;
}

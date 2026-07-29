/**
 * Competition boards: the same practice data, ranked at widening scopes.
 *
 * SECURITY: the scope VALUE is always read from the requester's own
 * `users.metadata.profile` — never from the request. A client cannot ask for
 * "Mumbai" and see Mumbai; it can only ask for "city", and the server decides
 * which city that is. Rows expose display name, rank and the metric, nothing else.
 */
import { db } from '../config/database';

export type Scope = 'team' | 'org' | 'city' | 'state' | 'india';
export type Metric = 'minutes' | 'score';
export type Window = 'week' | 'all';

const SCOPES = new Set<Scope>(['team', 'org', 'city', 'state', 'india']);
const TOP_N = 50;

export const parseScope = (v: unknown): Scope => (SCOPES.has(String(v) as Scope) ? (String(v) as Scope) : 'india');
export const parseMetric = (v: unknown): Metric => (String(v) === 'score' ? 'score' : 'minutes');
export const parseWindow = (v: unknown): Window => (String(v) === 'all' ? 'all' : 'week');

export interface Row {
  rank: number;
  userId: string;
  name: string;
  minutes: number;
  score: number | null;
  calls: number;
  isMe: boolean;
}

export interface Board {
  scope: Scope;
  metric: Metric;
  window: Window;
  /** What the scope resolved to for this user ("Lucknow"). Null = not set yet. */
  scopeLabel: string | null;
  /** Which profile field to collect when the scope cannot be resolved. */
  missing: 'org' | 'city' | 'state' | 'team' | null;
  rows: Row[];
  me: Row | null;
  total: number;
}

interface Profile { org?: string; city?: string; state?: string }

async function profileOf(userId: string): Promise<Profile> {
  const r = await db.query("SELECT COALESCE(metadata->'profile', '{}'::jsonb) AS p FROM users WHERE id = $1", [userId]);
  return (r.rows[0]?.p ?? {}) as Profile;
}

/**
 * The set of user ids in scope, plus a label. Everything is derived from the
 * caller's own record.
 */
async function peers(userId: string, scope: Scope): Promise<{ ids: string[] | null; label: string | null; missing: Board['missing'] }> {
  if (scope === 'india') return { ids: null, label: 'India', missing: null };

  if (scope === 'team') {
    const r = await db.query(
      `SELECT DISTINCT other.user_id
         FROM workspace_members mine
         JOIN workspace_members other ON other.workspace_id = mine.workspace_id
        WHERE mine.user_id = $1`,
      [userId],
    );
    const ids = r.rows.map((x: { user_id: string }) => x.user_id);
    if (ids.length <= 1) return { ids: null, label: null, missing: 'team' };
    const name = await db.query(
      `SELECT w.name FROM workspace_members wm JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.user_id = $1 ORDER BY wm.joined_at ASC LIMIT 1`,
      [userId],
    );
    return { ids, label: name.rows[0]?.name ?? 'My team', missing: null };
  }

  const p = await profileOf(userId);
  const field = scope === 'org' ? 'org' : scope === 'city' ? 'city' : 'state';
  const value = String(p[field] ?? '').trim();
  if (!value) return { ids: null, label: null, missing: field };

  // Case-insensitive match so "lucknow" and "Lucknow" share a board.
  const r = await db.query(
    `SELECT id FROM users
      WHERE deleted_at IS NULL
        AND LOWER(TRIM(COALESCE(metadata->'profile'->>$1, ''))) = LOWER($2)`,
    [field, value],
  );
  return { ids: r.rows.map((x: { id: string }) => x.id), label: value, missing: null };
}

export async function boardFor(userId: string, scope: Scope, metric: Metric, window: Window): Promise<Board> {
  const { ids, label, missing } = await peers(userId, scope);
  if (missing) {
    return { scope, metric, window, scopeLabel: null, missing, rows: [], me: null, total: 0 };
  }

  // No userId here: "is this me" is decided in JS below, so the national board
  // binds zero parameters and pg rejects any extras.
  const params: unknown[] = [];
  const conds: string[] = ['u.deleted_at IS NULL'];
  if (ids) {
    params.push(ids);
    conds.push(`u.id = ANY($${params.length})`);
  }
  const since = window === 'week' ? "AND s.ended_at >= NOW() - INTERVAL '7 days'" : '';

  // One aggregate. Users with no practice in the window still appear at zero,
  // which is why this is a LEFT JOIN rather than a filter.
  const result = await db.query(
    `SELECT u.id,
            COALESCE(NULLIF(TRIM(u.name), ''), 'Learner') AS name,
            COALESCE(SUM(s.duration_sec) / 60, 0)::int AS minutes,
            COUNT(s.id)::int AS calls,
            ROUND(AVG(sc.overall_score))::int AS score
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id AND s.status = 'completed' ${since}
       LEFT JOIN session_scores sc ON sc.session_id = s.id
      WHERE ${conds.join(' AND ')}
      GROUP BY u.id, u.name`,
    params,
  );

  interface Raw { id: string; name: string; minutes: number; calls: number; score: number | null }
  const raw = result.rows as Raw[];

  // Rank on the chosen metric. A score board only ranks people who have one.
  const ranked = raw
    .filter((r) => (metric === 'score' ? r.score != null : true))
    .sort((a, b) => (metric === 'score' ? (b.score ?? 0) - (a.score ?? 0) : b.minutes - a.minutes) || a.name.localeCompare(b.name))
    .map((r, i) => ({
      rank: i + 1,
      userId: r.id,
      name: r.name,
      minutes: r.minutes,
      score: r.score,
      calls: r.calls,
      isMe: r.id === userId,
    }));

  const me = ranked.find((r) => r.isMe) ?? null;
  return {
    scope, metric, window,
    scopeLabel: label,
    missing: null,
    rows: ranked.slice(0, TOP_N),
    // Always sent separately: the pinned row must survive being outside the top 50.
    me,
    total: ranked.length,
  };
}

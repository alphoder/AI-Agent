/**
 * Personal analytics, computed on read from sessions + session_scores.
 *
 * The conversational numbers (talk ratio, questions, fillers) are MEASURED by the
 * scorer and written into `narrative_feedback` as a small markdown block. We parse
 * them back out here. The previous UI derived them from the overall score with a
 * made-up formula, which invented precision the product never measured.
 */
import { db } from '../config/database';

export type Range = '7d' | '30d' | 'all';

const SINCE: Record<Range, string | null> = {
  '7d': "NOW() - INTERVAL '7 days'",
  '30d': "NOW() - INTERVAL '30 days'",
  all: null,
};

export function parseRange(value: unknown): Range {
  const v = String(value ?? '30d');
  return v === '7d' || v === 'all' ? v : '30d';
}

/** "**Talk-to-Listen Ratio:** 42% Learner / 58% Avatar" → 42 */
function talkRatioOf(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/talk[- ]to[- ]listen[^:]*:\s*\**\s*(\d{1,3})\s*%/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** "**Question Frequency:** 7 questions asked" → 7 */
function questionsOf(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/question frequency[^:]*:\s*\**\s*(\d{1,3})/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** "**Filler Word Usage:** 12 filler words detected" → 12 */
function fillersOf(text: string | null): number | null {
  if (!text) return null;
  const m = text.match(/filler word[^:]*:\s*\**\s*(\d{1,3})/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

const avg = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

export interface Analytics {
  range: Range;
  totals: { calls: number; minutes: number; avgScore: number | null; bestScore: number | null };
  perDay: { day: string; minutes: number; calls: number }[];
  trend: { at: string; score: number; title: string }[];
  criteria: { name: string; score: number }[];
  conversation: { talkRatio: number | null; questions: number | null; fillers: number | null; sampled: number };
}

export async function analyticsFor(userId: string, range: Range): Promise<Analytics> {
  const since = SINCE[range];
  const whereTime = since ? `AND s.ended_at >= ${since}` : '';

  const rows = await db.query(
    `SELECT s.ended_at, s.duration_sec,
            sc.overall_score::float AS overall_score, sc.criteria_scores, sc.narrative_feedback,
            scen.title
       FROM sessions s
       LEFT JOIN session_scores sc ON sc.session_id = s.id
       LEFT JOIN scenarios scen ON scen.id = s.scenario_id
      WHERE s.user_id = $1 AND s.status = 'completed' AND s.ended_at IS NOT NULL ${whereTime}
      ORDER BY s.ended_at ASC`,
    [userId],
  );

  interface Row {
    ended_at: string; duration_sec: number | null; overall_score: number | null;
    // The scorer writes `criterion_name`; the other spellings are belt and braces.
    criteria_scores: { criterion_name?: string; name?: string; criterion?: string; score?: number }[] | null;
    narrative_feedback: string | null; title: string | null;
  }
  const list = rows.rows as Row[];

  // --- totals ---
  const scores = list.map((r) => r.overall_score).filter((n): n is number => n != null);
  const totalSec = list.reduce((n, r) => n + (r.duration_sec ?? 0), 0);

  // --- minutes per day (dense: gaps are real zeros, not missing points) ---
  const byDay = new Map<string, { minutes: number; calls: number }>();
  for (const r of list) {
    const day = new Date(r.ended_at).toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { minutes: 0, calls: 0 };
    cur.minutes += (r.duration_sec ?? 0) / 60;
    cur.calls += 1;
    byDay.set(day, cur);
  }
  const days = range === '7d' ? 7 : range === '30d' ? 30 : Math.max(byDay.size, 1);
  const perDay: Analytics['perDay'] = [];
  if (range === 'all') {
    for (const [day, v] of [...byDay.entries()].sort()) {
      perDay.push({ day, minutes: Math.round(v.minutes * 10) / 10, calls: v.calls });
    }
  } else {
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const v = byDay.get(key);
      perDay.push({ day: key, minutes: v ? Math.round(v.minutes * 10) / 10 : 0, calls: v?.calls ?? 0 });
    }
  }

  // --- score trend (one point per scored call, chronological) ---
  const trend = list
    .filter((r) => r.overall_score != null)
    .map((r) => ({ at: r.ended_at, score: Math.round(r.overall_score as number), title: r.title ?? 'Practice call' }));

  // --- per-criterion averages, normalised to 0-100 (the scorer emits 1-5) ---
  const criteria = criteriaFrom(list);

  // --- conversation habits, parsed from what the scorer actually measured ---
  const talk = list.map((r) => talkRatioOf(r.narrative_feedback)).filter((n): n is number => n != null);
  const qs = list.map((r) => questionsOf(r.narrative_feedback)).filter((n): n is number => n != null);
  const fw = list.map((r) => fillersOf(r.narrative_feedback)).filter((n): n is number => n != null);

  return {
    range,
    totals: {
      calls: list.length,
      minutes: Math.round(totalSec / 60),
      avgScore: scores.length ? Math.round(avg(scores) as number) : null,
      bestScore: scores.length ? Math.round(Math.max(...scores)) : null,
    },
    perDay,
    trend,
    criteria,
    conversation: {
      talkRatio: avg(talk),
      questions: avg(qs),
      fillers: avg(fw),
      // How many calls these averages are based on: an average of one is not a trend.
      sampled: Math.max(talk.length, qs.length, fw.length),
    },
  };
}

export interface CompletedScenario {
  scenarioId: string;
  title: string;
  level: string | null;
  tags: string[];
  attempts: number;
  best: number | null;
  lastAt: string | null;
  lastSessionId: string | null;
}

/** Every scenario this user has finished at least once, with their best result. */
export async function completedFor(userId: string): Promise<CompletedScenario[]> {
  const result = await db.query(
    `SELECT s.scenario_id,
            scen.title, scen.difficulty_level, scen.tags,
            COUNT(*)::int AS attempts,
            MAX(sc.overall_score)::float AS best,
            MAX(s.ended_at) AS last_at,
            (ARRAY_AGG(s.id ORDER BY s.ended_at DESC NULLS LAST))[1] AS last_session_id
       FROM sessions s
       JOIN scenarios scen ON scen.id = s.scenario_id
       LEFT JOIN session_scores sc ON sc.session_id = s.id
      WHERE s.user_id = $1 AND s.status = 'completed' AND s.scenario_id IS NOT NULL
      GROUP BY s.scenario_id, scen.title, scen.difficulty_level, scen.tags
      ORDER BY MAX(s.ended_at) DESC NULLS LAST`,
    [userId],
  );
  return result.rows.map((r: {
    scenario_id: string; title: string; difficulty_level: string | null; tags: string[] | null;
    attempts: number; best: number | null; last_at: string | null; last_session_id: string | null;
  }) => ({
    scenarioId: r.scenario_id,
    title: r.title,
    level: r.difficulty_level,
    tags: r.tags ?? [],
    attempts: r.attempts,
    best: r.best,
    lastAt: r.last_at,
    lastSessionId: r.last_session_id,
  }));
}

/** Pull criterion averages out of a score row's JSONB, normalised to 0-100. */
export function criteriaFrom(rows: { criteria_scores: unknown }[]): { name: string; score: number }[] {
  const byCriterion = new Map<string, number[]>();
  for (const r of rows) {
    for (const c of (r.criteria_scores ?? []) as { criterion_name?: string; name?: string; criterion?: string; score?: number }[]) {
      const name = String(c.criterion_name ?? c.name ?? c.criterion ?? '').trim();
      const raw = Number(c.score);
      if (!name || !Number.isFinite(raw)) continue;
      const pct = raw <= 5 ? (raw / 5) * 100 : raw;
      byCriterion.set(name, [...(byCriterion.get(name) ?? []), pct]);
    }
  }
  return [...byCriterion.entries()]
    .map(([name, xs]) => ({ name, score: Math.round(avg(xs) ?? 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export const __test = { talkRatioOf, questionsOf, fillersOf, criteriaFrom };

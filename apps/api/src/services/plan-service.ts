import { db } from '../config/database';
import { logger } from '../config/logger';
import { callAIService } from '../utils/ai-service-client';
import {
  INTAKE_IDS, INTAKE_LIMITS, MINUTES_PER_DAY, DAYS_PER_WEEK, INDIAN_STATES,
  INTAKE_ROLES, INTAKE_INDUSTRIES, INTAKE_OUTCOMES, INTAKE_STRUGGLES,
  PLAN_TASK_TYPES, TASK_MINUTES, JOURNEY_PLAN_LIMIT_PER_MONTH, JOURNEY_PASS_SCORE,
  type Intake, type JourneyPlan, type JourneyPlanKind, type PlanTaskType,
} from '@avatar-platform/shared';

/**
 * Plans a user may generate per month (intake build + rebuilds). Extended
 * journeys are free: they are generated only when the current plan is finished
 * and are counted separately (see plansThisMonth). Guards the Gemini bill.
 */
export const PLAN_LIMIT_PER_MONTH = JOURNEY_PLAN_LIMIT_PER_MONTH;
const PLAN_DAYS = 7;   // one week at a time (your call), not freebuff's 14
const PLAN_TIMEOUT_MS = 30_000;

// The pool of candidate scenarios sent to the model. Sending the whole
// catalogue (up to 200 rows) makes the call slow and expensive; a curated,
// relevance-ranked pool is cheaper, faster, and produces a tighter plan.
const SCENARIO_POOL_SIZE = 48;
// Never send a starved pool: if almost everything is passed, top up from passed
// scenarios rather than handing the model nothing to work with.
const POOL_MIN_FLOOR = 10;

// --- validation -------------------------------------------------------------

/** Free text that will be stored and shown back: strip control chars, cap length. */
function clean(value: unknown, max: number): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function pick(value: unknown, allowed: string[], fallback: string): string {
  const v = String(value ?? '');
  return allowed.includes(v) ? v : fallback;
}

function pickMany(value: unknown, allowed: string[], max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const raw of value) {
    const v = String(raw ?? '');
    if (allowed.includes(v)) seen.add(v);
    if (seen.size >= max) break;
  }
  return [...seen];
}

function pickNumber(value: unknown, allowed: readonly number[], fallback: number): number {
  const n = Number(value);
  return allowed.includes(n as never) ? n : fallback;
}

/**
 * Coerce whatever the client posted into a valid Intake. Nothing throws: an
 * unknown option becomes the safe default rather than a 400, because a stale
 * client should still be able to finish onboarding.
 */
export function normaliseIntake(body: unknown): Intake {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    role: pick(b.role, INTAKE_IDS.role, 'other'),
    industry: pick(b.industry, INTAKE_IDS.industry, 'other'),
    experience: pick(b.experience, INTAKE_IDS.experience, 'some'),
    outcomes: pickMany(b.outcomes, INTAKE_IDS.outcomes, INTAKE_LIMITS.outcomes),
    struggles: pickMany(b.struggles, INTAKE_IDS.struggles, INTAKE_LIMITS.struggles),
    struggleNote: clean(b.struggleNote, INTAKE_LIMITS.note),
    minutesPerDay: pickNumber(b.minutesPerDay, MINUTES_PER_DAY, 15),
    daysPerWeek: pickNumber(b.daysPerWeek, DAYS_PER_WEEK, 5),
    org: clean(b.org, INTAKE_LIMITS.org),
    city: clean(b.city, INTAKE_LIMITS.city),
    state: INDIAN_STATES.includes(String(b.state ?? '')) ? String(b.state) : '',
    intensity: pick(b.intensity, INTAKE_IDS.intensity, 'balanced'),
    completedAt: new Date().toISOString(),
  };
}

// --- generation -------------------------------------------------------------

/**
 * The day each difficulty tier unlocks, per intensity. Mirrors UNLOCK_DAY in
 * ai-service/src/routes/plan.py: the model is *told* this, and we enforce it here
 * too, because a model asked for the perfect topic match will happily put an
 * advanced customer on day one of a beginner's plan.
 */
const UNLOCK_DAY: Record<string, Record<string, number>> = {
  gentle: { beginner: 1, intermediate: 5, advanced: 10 },
  balanced: { beginner: 1, intermediate: 3, advanced: 7 },
  hard: { beginner: 1, intermediate: 1, advanced: 3 },
};

function unlockDay(intensity: string, difficulty: string | null): number {
  return UNLOCK_DAY[intensity]?.[(difficulty ?? '').toLowerCase()] ?? 1;
}

/** At most this many tasks on the SAME scenario in one day: the "learn it, then
 *  do it" pair. A third (a drill on the same call) is padding, not practice. */
const MAX_PER_SCENARIO_PER_DAY = 2;

/**
 * Trim a day to the time the learner actually said they had, and stop it becoming
 * one scenario done three ways.
 *
 * Telling the model to "fill the day" made it do exactly that: module + call +
 * drill of a single scenario on 11 days out of 14, every one 17 minutes against a
 * 15-minute budget. The prompt asks; this decides. Carried over from the previous
 * planner, which this file otherwise replaces.
 */
function fitTheDay(tasks: { type: PlanTaskType; scenarioId: string; why: string }[], minutesPerDay: number) {
  const budget = Math.max(5, minutesPerDay);
  const perScenario = new Map<string, number>();
  const kept: typeof tasks = [];
  let spent = 0;

  for (const t of tasks) {
    const used = perScenario.get(t.scenarioId) ?? 0;
    if (used >= MAX_PER_SCENARIO_PER_DAY) continue;
    const cost = TASK_MINUTES[t.type] ?? 5;
    // Always keep the first task, even on a budget too small for it: a day with
    // nothing in it is worse than a day that runs slightly long.
    if (kept.length > 0 && spent + cost > budget) continue;
    kept.push(t);
    perScenario.set(t.scenarioId, used + 1);
    spent += cost;
  }
  return kept;
}

interface CatalogueRow {
  id: string;
  title: string;
  difficulty_level: string | null;
  tags: string[] | null;
  description: string | null;
}

/** The learner's best score per scenario — the single source of "passed". */
async function bestScores(userId: string): Promise<Map<string, number>> {
  const res = await db.query(
    `SELECT s.scenario_id, MAX(sc.overall_score)::float AS best
       FROM sessions s
       JOIN session_scores sc ON sc.session_id = s.id
      WHERE s.user_id = $1
      GROUP BY s.scenario_id`,
    [userId],
  );
  return new Map(res.rows.map((r) => [r.scenario_id, Number(r.best)]));
}

/** Keywords that make a scenario relevant to THIS learner's answers. */
function relevanceKeywords(intake: Intake): Set<string> {
  const words = new Set<string>();
  const add = (s: string) => {
    for (const w of s.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2) words.add(w);
  };
  add(intake.role);
  add(intake.industry);
  intake.outcomes.forEach(add);
  intake.struggles.forEach(add);
  // The ids are terse ('cold_calls'); the labels ('Open cold calls') carry more.
  const opts = [...INTAKE_ROLES, ...INTAKE_INDUSTRIES, ...INTAKE_OUTCOMES, ...INTAKE_STRUGGLES];
  for (const o of opts) {
    if (intake.outcomes.includes(o.id) || intake.struggles.includes(o.id)
      || intake.role === o.id || intake.industry === o.id) add(o.label);
  }
  return words;
}

function relevanceScore(row: CatalogueRow, keywords: Set<string>): number {
  let score = 0;
  for (const tag of row.tags ?? []) {
    for (const w of tag.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2 && keywords.has(w)) score += 1;
  }
  const title = (row.title ?? '').toLowerCase();
  for (const w of title.split(/[^a-z0-9]+/)) if (w.length > 3 && keywords.has(w)) score += 2;
  return score;
}

/**
 * Pick the candidate pool the model may choose from.
 *
 * - Passed scenarios (best >= JOURNEY_PASS_SCORE) are excluded, so a plan never
 *   re-trains mastered material. If that starves the pool, passed scenarios top
 *   it back up (better a repeat than a threadbare plan).
 * - Attempted-but-not-passed scenarios rank lower: prefer fresh material.
 * - Tier-balanced: each difficulty level gets an equal share of the pool so the
 *   model can still build the difficulty ramp the plan needs.
 */
async function selectScenarioPool(userId: string, intake: Intake, limit = SCENARIO_POOL_SIZE): Promise<CatalogueRow[]> {
  const catalogue = await db.query(
    `SELECT id, title, difficulty_level, tags, description
       FROM scenarios
      WHERE deleted_at IS NULL AND visibility = 'public' AND created_by IS NULL`,
  );
  if (catalogue.rows.length === 0) throw new Error('scenario catalogue is empty');

  const best = await bestScores(userId);
  const isPassed = (id: string) => (best.get(id) ?? 0) >= JOURNEY_PASS_SCORE;
  const keywords = relevanceKeywords(intake);
  const ranked = (catalogue.rows as CatalogueRow[])
    .map((row) => ({ row, score: relevanceScore(row, keywords) - (isPassed(row.id) ? 2 : best.has(row.id) ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title));

  // Fresh (not yet passed) scenarios first; a passed scenario is only a
  // top-up if the pool would otherwise be too thin to build a plan.
  const fresh = ranked.filter((x) => !isPassed(x.row.id));
  const pool = fresh.length >= POOL_MIN_FLOOR ? fresh : [...fresh, ...ranked.filter((x) => isPassed(x.row.id))];

  // Tier balance: give every difficulty an equal slice of the pool.
  const byTier = new Map<string, typeof pool>();
  for (const x of pool) {
    const tier = x.row.difficulty_level ?? 'intermediate';
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(x);
  }
  const perTier = Math.max(1, Math.ceil(limit / byTier.size));
  const chosen: typeof pool = [];
  for (const tierRows of byTier.values()) chosen.push(...tierRows.slice(0, perTier));
  return chosen.slice(0, limit).map((x) => x.row);
}

/**
 * Build a plan for this user and persist it.
 *
 * The catalogue sent to the model is a curated, relevance-ranked pool (passed
 * scenarios excluded), so the call is cheaper, faster and more focused than
 * shipping the entire library.
 *
 * Every scenarioId the model returns is checked against the pool we sent before
 * it reaches the database, so a hallucinated id can never become a task the
 * learner cannot open.
 */
export async function generatePlan(
  userId: string,
  intake: Intake,
  learnerName: string,
  opts: { kind?: JourneyPlanKind; week?: number } = {},
): Promise<JourneyPlan> {
  const catalogue = await selectScenarioPool(userId, intake, SCENARIO_POOL_SIZE);

  const byId = new Map(catalogue.map((r) => [r.id, r]));

  const res = await callAIService({
    path: '/plan/generate',
    timeoutMs: PLAN_TIMEOUT_MS,
    body: {
      intake,
      learner_name: learnerName.slice(0, 40),
      days: PLAN_DAYS,
      catalogue: catalogue.map((r) => ({
        id: r.id,
        title: r.title,
        difficulty: r.difficulty_level ?? '',
        tags: r.tags ?? [],
        summary: r.description ?? '',
      })),
    },
  });
  const raw = (await res.json()) as JourneyPlan;
  const kind: JourneyPlanKind = opts.kind ?? 'initial';
  const week = Math.max(1, opts.week ?? 1);
  // The ramp is measured from the start of the JOURNEY, not of the week: by week
  // three a "from day 10" scenario is legal on the first day of the week.
  const dayOffset = (week - 1) * PLAN_DAYS;

  const days = (raw.days ?? [])
    .map((d, i) => ({
      day: i + 1,
      focus: clean(d.focus, 60),
      tasks: (d.tasks ?? [])
        .filter((t) => byId.has(t.scenarioId) && PLAN_TASK_TYPES.includes(t.type as PlanTaskType))
        .filter((t) => unlockDay(intake.intensity, byId.get(t.scenarioId)!.difficulty_level) <= dayOffset + i + 1)
        .slice(0, INTAKE_LIMITS.tasksPerDay)
        .map((t) => ({ type: t.type, scenarioId: t.scenarioId, why: clean(t.why, 160) })),
    }))
    .map((d) => ({ ...d, tasks: fitTheDay(d.tasks, intake.minutesPerDay) }))
    .filter((d) => d.tasks.length > 0)
    .slice(0, INTAKE_LIMITS.planDays)
    // Dropping an illegal task can empty a day, so renumber after filtering.
    .map((d, i) => ({ ...d, day: i + 1 }));

  if (days.length === 0) throw new Error('plan had no usable days');

  const plan: JourneyPlan = { headline: clean(raw.headline, 120), week, days, kind };
  await db.query(
    `INSERT INTO journey_plans (user_id, week, plan) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT ON CONSTRAINT journey_plans_user_week_unique
     DO UPDATE SET plan = EXCLUDED.plan, created_at = NOW()`,
    [userId, week, JSON.stringify(plan)],
  );
  logger.info({ userId, week, days: days.length }, 'journey week generated');
  return plan;
}

/** The live plan is simply the newest row. */
export async function getPlan(userId: string): Promise<JourneyPlan | null> {
  const res = await db.query(
    'SELECT plan FROM journey_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId],
  );
  return res.rows[0]?.plan ?? null;
}

/** Exposed for the self-check in plan-service.test.ts. */
export const __test = { unlockDay, fitTheDay };

/**
 * How many plan generations this user has used in the last 30 days.
 * Extended journeys are free and deliberately excluded: they only happen once
 * the current plan is finished, so they can never be farmed for rewrites.
 */
export async function plansThisMonth(userId: string): Promise<number> {
  const res = await db.query(
    `SELECT COUNT(*)::int AS n FROM journey_plans
      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
        AND (plan->>'kind' IS DISTINCT FROM 'extended')`,
    [userId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

import { db } from '../config/database';
import { logger } from '../config/logger';
import { callAIService } from '../utils/ai-service-client';
import {
  INTAKE_IDS, INTAKE_LIMITS, MINUTES_PER_DAY, DAYS_PER_WEEK, INDIAN_STATES,
  PLAN_TASK_TYPES, type Intake, type JourneyPlan, type PlanTaskType,
} from '@avatar-platform/shared';

/** Plans a user may generate per day. Guards the Gemini bill and the DB. */
export const PLAN_LIMIT_PER_DAY = 3;
const PLAN_DAYS = 14;
const PLAN_TIMEOUT_MS = 30_000;

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

interface CatalogueRow {
  id: string;
  title: string;
  difficulty_level: string | null;
  tags: string[] | null;
  description: string | null;
}

/**
 * Build a plan for this user and persist it.
 *
 * Every scenarioId the model returns is checked against the catalogue we sent
 * before it reaches the database, so a hallucinated id can never become a task
 * the learner cannot open.
 */
export async function generatePlan(userId: string, intake: Intake, learnerName: string): Promise<JourneyPlan> {
  const catalogue = await db.query(
    `SELECT id, title, difficulty_level, tags, description
       FROM scenarios
      WHERE deleted_at IS NULL AND visibility = 'public' AND created_by IS NULL
      ORDER BY difficulty_level, title
      LIMIT 200`,
  );
  if (catalogue.rows.length === 0) throw new Error('scenario catalogue is empty');

  const byId = new Map(catalogue.rows.map((r) => [r.id, r]));

  const res = await callAIService({
    path: '/plan/generate',
    timeoutMs: PLAN_TIMEOUT_MS,
    body: {
      intake,
      learner_name: learnerName.slice(0, 40),
      days: PLAN_DAYS,
      catalogue: catalogue.rows.map((r) => ({
        id: r.id,
        title: r.title,
        difficulty: r.difficulty_level ?? '',
        tags: r.tags ?? [],
        summary: r.description ?? '',
      })),
    },
  });
  const raw = (await res.json()) as JourneyPlan;

  const days = (raw.days ?? [])
    .map((d, i) => ({
      day: i + 1,
      focus: clean(d.focus, 60),
      tasks: (d.tasks ?? [])
        .filter((t) => byId.has(t.scenarioId) && PLAN_TASK_TYPES.includes(t.type as PlanTaskType))
        .filter((t) => unlockDay(intake.intensity, byId.get(t.scenarioId)!.difficulty_level) <= i + 1)
        .slice(0, INTAKE_LIMITS.tasksPerDay)
        .map((t) => ({ type: t.type, scenarioId: t.scenarioId, why: clean(t.why, 160) })),
    }))
    .filter((d) => d.tasks.length > 0)
    .slice(0, INTAKE_LIMITS.planDays)
    // Dropping an illegal task can empty a day, so renumber after filtering.
    .map((d, i) => ({ ...d, day: i + 1 }));

  if (days.length === 0) throw new Error('plan had no usable days');

  const plan: JourneyPlan = { headline: clean(raw.headline, 120), days };
  await db.query('INSERT INTO journey_plans (user_id, plan) VALUES ($1, $2::jsonb)', [userId, JSON.stringify(plan)]);
  logger.info({ userId, days: days.length }, 'journey plan generated');
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
export const __test = { unlockDay };

/** How many plans this user generated in the last 24h. */
export async function plansToday(userId: string): Promise<number> {
  const res = await db.query(
    "SELECT COUNT(*)::int AS n FROM journey_plans WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'",
    [userId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

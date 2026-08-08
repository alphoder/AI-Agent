/**
 * Which scenarios a given learner is offered — the piece that makes the journey
 * personal rather than a shuffle of the whole library.
 *
 * Pure on purpose: no database, no AI client, no env. That keeps it directly
 * testable (see __tests__/journey-shortlist.test.ts) and keeps the decision of
 * "what should this person practise" separate from "go and fetch it".
 */
import { MASTERY, categoryFor, type Intake } from '@avatar-platform/shared';

export interface CatalogueRow {
  id: string;
  title: string;
  difficulty_level: string | null;
  tags: string[] | null;
  description: string | null;
}

/** A scenario is "mastered" — and so dropped from later weeks — at silver. */
export const MASTERED_AT = MASTERY.silver;

/**
 * Which browse categories each intake answer points at. This is the role→content
 * rule, and it lives in code rather than in the prompt on purpose: asking a model
 * to infer "job seeker means Interview" from a wall of tags worked when there were
 * two categories and drifts badly now there are eight.
 *
 * Keys are ids from INTAKE_ROLES / INTAKE_OUTCOMES; values are catalog.ts keys.
 */
const ROLE_CATEGORIES: Record<string, string[]> = {
  sales: ['sales', 'negotiation'],
  account: ['client-growth', 'sales'],
  support: ['support', 'confidence'],
  manager: ['leadership', 'speaking'],
  founder: ['speaking', 'sales', 'negotiation'],
  job_seeker: ['interview', 'confidence'],
  student: ['interview', 'confidence', 'speaking'],
  other: ['confidence', 'speaking'],
};

const OUTCOME_CATEGORIES: Record<string, string[]> = {
  close_more: ['sales'],
  objections: ['sales', 'negotiation'],
  cold_calls: ['sales'],
  interviews: ['interview'],
  hard_talks: ['leadership'],
  presence: ['speaking'],
  angry: ['support'],
  fluency: ['confidence'],
};

/**
 * Tags that each "where it breaks today" answer points at. Used only to rank
 * within the chosen categories — never to choose a category, because the moment
 * that goes wrong says nothing about which room you are in.
 */
const STRUGGLE_TAGS: Record<string, string[]> = {
  opening: ['cold-call', 'small-talk', 'screening', 'networking'],
  blank: ['q-and-a', 'behavioural', 'hiring-manager'],
  rambling: ['fluency', 'clarity', 'pitch', 'stakeholder'],
  price: ['pricing', 'objection-handling', 'salary'],
  pushback: ['objection-handling', 'angry', 'conflict', 'escalation'],
  listening: ['meaningful-conversations', 'whitespace', 'de-escalation'],
  closing: ['closing', 'follow-up', 'saying-no', 'terms'],
  fillers: ['fluency', 'clarity', 'introduction'],
};

/** How many scenarios reach the model. Small enough that the prompt is never
 *  truncated, large enough that two learners rarely get the same week. */
const SHORTLIST_SIZE = 60;

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Pick the scenarios this specific learner should be offered this week.
 *
 * Deterministic and done in code, so the personalisation cannot depend on how
 * much of a 240-line catalogue survived the prompt. Three rules:
 *   1. Only categories their role and goals point at (their industry and the
 *      struggle note stay in the prompt, to colour the choice inside those).
 *   2. Nothing they have already mastered — that is what makes week N+1 new.
 *   3. Balanced across difficulty, so the ramp always has somewhere to go.
 */
export function shortlist(rows: CatalogueRow[], intake: Intake, mastered: Set<string>): CatalogueRow[] {
  const wanted = uniq([
    ...(ROLE_CATEGORIES[intake.role] ?? ROLE_CATEGORIES.other),
    ...intake.outcomes.flatMap((o) => OUTCOME_CATEGORIES[o] ?? []),
  ]);
  // The role's own categories rank above ones only a goal asked for.
  const rank = new Map(wanted.map((c, i) => [c, i]));
  const boost = new Set(intake.struggles.flatMap((s) => STRUGGLE_TAGS[s] ?? []));

  const eligible = rows
    .filter((r) => !mastered.has(r.id))
    .map((r) => ({ row: r, category: categoryFor(r.tags) }))
    .filter((r) => rank.has(r.category));

  // Within a category: the moment they said goes wrong first, then title for a
  // stable order. No randomness — two identical intakes must shortlist alike.
  const hit = (r: CatalogueRow) => ((r.tags ?? []).some((t) => boost.has(t)) ? 0 : 1);
  const queues = wanted.map((c) =>
    eligible
      .filter((e) => e.category === c)
      .map((e) => e.row)
      .sort((a, b) => hit(a) - hit(b) || a.title.localeCompare(b.title)),
  );

  // Draw round-robin across the categories rather than exhausting the first one.
  // Straight rank order looked fine until Sales grew to 50: it filled the whole
  // shortlist on its own, and a learner who asked for interview practice as well
  // never saw a single interview. Every category they asked for gets a turn.
  const quota: Record<string, number> = { beginner: 28, intermediate: 20, advanced: 12 };
  const at = new Array(queues.length).fill(0);
  const picked: CatalogueRow[] = [];
  let drew = true;
  while (picked.length < SHORTLIST_SIZE && drew) {
    drew = false;
    for (let q = 0; q < queues.length && picked.length < SHORTLIST_SIZE; q++) {
      // Take this category's next row that still has room in its tier.
      while (at[q] < queues[q].length) {
        const row = queues[q][at[q]++];
        const tier = (row.difficulty_level ?? 'intermediate').toLowerCase();
        if ((quota[tier] ?? 0) <= 0) continue;
        quota[tier]--;
        picked.push(row);
        drew = true;
        break;
      }
    }
  }
  // A tier can run dry (an under-populated category); top up from what is left
  // rather than sending a thin list.
  if (picked.length < SHORTLIST_SIZE) {
    const have = new Set(picked.map((r) => r.id));
    for (const { row } of eligible) {
      if (have.has(row.id)) continue;
      picked.push(row);
      if (picked.length >= SHORTLIST_SIZE) break;
    }
  }
  return picked;
}


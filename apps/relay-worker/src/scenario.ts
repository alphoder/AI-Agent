/**
 * Scenario authoring — a port of apps/ai-service/src/routes/scenario.py.
 *
 * The normalisation is the substance. Two rules the app owns rather than the
 * model: rubric weights must sum to 100 or the 0-100 score is meaningless, and
 * a generated persona must carry the stay-in-character instruction whether or
 * not the model remembered it.
 */
import { SCENARIO_STAY_IN_CHARACTER } from './prompts.ts';

export const CATEGORIES: Record<string, string> = {
  'sales': 'Insurance and BFSI selling: cold calls, objections, renewals, commercial lines.',
  'client-growth': 'Growing an existing account: consultative and strategic conversations.',
  'interview': 'Job interviews: screening, hiring manager, behavioural, salary.',
  'support': 'Customer support: angry customers, escalations, retention saves.',
  'negotiation': 'Negotiating terms, price or scope, usually with a counterparty.',
  'leadership': 'Managing people: feedback, performance, conflict, saying no.',
  'speaking': 'Public speaking: pitches, demos, stakeholder updates, Q&A.',
  'confidence': 'Everyday confidence: networking, small talk, introductions, fluency.',
};

const DIFFICULTIES = new Set(['beginner', 'intermediate', 'advanced']);

/** python round() is banker's rounding; at whole weights the difference shows. */
function pyRound(n: number): number {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (Math.abs(diff - 0.5) < Number.EPSILON * 8) return floor % 2 === 0 ? floor : floor + 1;
  return Math.round(n);
}

/** Shape the model's output to the contract. The gateway validates again. */
export function normalise(out: any, language: string): any {
  let diff = String(out?.difficulty ?? '').toLowerCase();
  if (!DIFFICULTIES.has(diff)) diff = 'intermediate';

  let category = String(out?.category ?? '').trim().toLowerCase();
  if (!(category in CATEGORIES)) category = 'sales';

  const tags: string[] = [];
  for (const t of (Array.isArray(out?.tags) ? out.tags : []).slice(0, 6)) {
    const tag = String(t).trim().toLowerCase().replace(/ /g, '-')
      .replace(/[^a-z0-9-]/g, '').slice(0, 24);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  // The category is always a tag, so the browser can file it without guessing.
  if (!tags.includes(category)) tags.unshift(category);

  // Weights must sum to 100 or the 0-100 score is meaningless.
  const rubric: any[] = [];
  for (const c of (Array.isArray(out?.rubric) ? out.rubric : []).slice(0, 5)) {
    const name = String(c?.name ?? '').trim().slice(0, 60);
    if (!name) continue;
    const raw = Number(c?.weight);
    const weight = Number.isFinite(raw) ? Math.max(1, Math.trunc(raw)) : 1;
    rubric.push({ name, description: String(c?.description ?? '').trim().slice(0, 300), weight });
  }
  if (rubric.length) {
    const total = rubric.reduce((n, c) => n + c.weight, 0);
    if (total !== 100) {
      // Rescale, then push the rounding remainder onto the heaviest criterion.
      for (const c of rubric) c.weight = Math.max(1, pyRound((c.weight * 100) / total));
      const drift = 100 - rubric.reduce((n, c) => n + c.weight, 0);
      const heaviest = rubric.reduce((a, b) => (b.weight > a.weight ? b : a), rubric[0]);
      heaviest.weight = Math.max(1, heaviest.weight + drift);
    }
  }

  let character = String(out?.character ?? '').trim();
  // The app owns the stay-in-character rule; a generated persona must not skip it.
  if (!character.includes(SCENARIO_STAY_IN_CHARACTER)) {
    character = `${character} ${SCENARIO_STAY_IN_CHARACTER}`.trim();
  }

  return {
    title: String(out?.title ?? '').trim().slice(0, 120) || 'Practice call',
    description: String(out?.description ?? '').trim().slice(0, 400),
    objective: String(out?.objective ?? '').trim().slice(0, 400),
    character: character.slice(0, 6000),
    opening: String(out?.opening ?? '').trim().slice(0, 400),
    category,
    tags,
    voice_gender: String(out?.voice_gender ?? '').toLowerCase() === 'male' ? 'male' : 'female',
    difficulty: diff,
    rubric,
    language,
  };
}

export function categoryCatalogue(): string {
  return Object.entries(CATEGORIES).map(([k, v]) => `- "${k}": ${v}`).join('\n');
}

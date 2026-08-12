/**
 * Post-session scoring — a port of apps/ai-service/src/core/scoring.py.
 *
 * The part that matters is `grade`. The model is asked to echo the rubric
 * weights back and mostly does, but it is free text: it drifts them,
 * renormalises them, or invents a criterion. Trusting those numbers would let
 * the model decide how much each criterion is worth, which is the one part of
 * scoring that must not be negotiable. The rubric is the authority; the model
 * supplies only the 1-5 judgement and the justification.
 */
import * as P from './prompts.ts';

/** The rubric's own middle level is the line between weak and acceptable. */
export const CRITERION_PASS = 3.0;

export interface RubricCriterion {
  name: string;
  description?: string;
  weight: number;
  levels?: Array<{ score: number; label?: string; description: string }>;
}

export interface GradedCriterion {
  criterion_name: string;
  score: number;
  weight: number;
  justification: string;
  passed: boolean;
  off_rubric: boolean;
}

/** Match criterion names loosely: the model re-cases and re-punctuates them. */
export function norm(name: unknown): string {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Re-attach the RUBRIC's weight to each criterion the model scored.
 *
 * Anything the model returns that is not in the rubric is kept and shown, but
 * carries zero weight, so an invented criterion cannot move the grade.
 */
export function grade(returned: any[], rubric: RubricCriterion[]): GradedCriterion[] {
  const byName = new Map(rubric.map((c) => [norm(c.name), c]));
  const out: GradedCriterion[] = [];

  for (const c of Array.isArray(returned) ? returned : []) {
    const name = String(c?.criterion_name ?? c?.name ?? '').trim();
    const match = byName.get(norm(name));

    // A 1-5 rubric; 7 or -1 is not a score.
    const raw = Number(c?.score);
    const score = Number.isFinite(raw) ? Math.max(0, Math.min(5, raw)) : 0;
    const weight = match ? Number(match.weight ?? 0) || 0 : 0;

    out.push({
      criterion_name: match ? match.name : name,
      score,
      weight,
      justification: String(c?.justification ?? '').trim(),
      // Surfaced so the report can mark the criterion pass/fail per-line.
      passed: score >= CRITERION_PASS,
      off_rubric: !match,
    });
  }

  const invented = out.filter((c) => c.off_rubric).map((c) => c.criterion_name);
  if (invented.length) console.warn('scoring.off_rubric_criteria', invented.slice(0, 5));
  return out;
}

/** Weighted 0-100. Falls back to an equal-weight mean when no criterion matched. */
export function overall(criteria: GradedCriterion[]): number {
  const total = criteria.reduce((n, c) => n + c.weight, 0);
  if (total > 0) {
    const sum = criteria.reduce((n, c) => n + (c.score / 5) * c.weight, 0);
    return round1((sum / total) * 100);
  }
  if (!criteria.length) return 0.0;
  const mean = criteria.reduce((n, c) => n + c.score, 0) / criteria.length;
  return round1((mean / 5) * 100);
}

/** Python's round() is banker's rounding; at one decimal the difference shows. */
function round1(n: number): number {
  const scaled = n * 10;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let r: number;
  if (Math.abs(diff - 0.5) < Number.EPSILON * 8) {
    r = floor % 2 === 0 ? floor : floor + 1;      // ties to even, as python does
  } else {
    r = Math.round(scaled);
  }
  return r / 10;
}

export function defaultRubric(difficulty: string): RubricCriterion[] {
  const d = String(difficulty ?? '').toLowerCase();
  if (d === 'beginner') return P.BEGINNER_RUBRIC as RubricCriterion[];
  if (d === 'advanced') return P.ADVANCED_RUBRIC as RubricCriterion[];
  return P.INTERMEDIATE_RUBRIC as RubricCriterion[];
}

// --- prompt assembly --------------------------------------------------------

export function formatTranscript(transcript: any[]): string {
  if (!transcript?.length) return '(Empty transcript)';

  let start: number | null = null;
  const lines: string[] = [];

  for (const t of transcript) {
    const role = t?.role ?? '?';
    const content = t?.content ?? '';
    let stamp = '';

    const rawAt = t?.created_at;
    if (rawAt) {
      // Postgres hands back "2026-08-10 18:12:43.13+00"; JS needs the T and Z.
      const iso = typeof rawAt === 'string'
        ? rawAt.replace(' ', 'T').replace(/\+00(:00)?$/, 'Z')
        : rawAt;
      const dt = new Date(iso).getTime();
      if (Number.isFinite(dt)) {
        if (start === null) start = dt;
        const elapsed = Math.trunc((dt - start) / 1000);
        const mm = String(Math.trunc(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');
        stamp = `[${mm}:${ss}] `;
      }
    }
    lines.push(`${stamp}${role}: ${content}`);
  }
  return lines.join('\n');
}

export function formatRubric(rubric: RubricCriterion[]): string {
  return rubric.map((c, i) => {
    let header = `Criterion ${i + 1}: ${c.name ?? ''} (Weight: ${c.weight ?? 0}%)\n`
      + `Description: ${c.description ?? ''}`;
    const levels = c.levels ?? [];
    if (levels.length) {
      const sorted = [...levels].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
      header += '\nLevels:\n' + sorted.map((l) => `  Score ${l.score ?? '?'}: ${l.description ?? ''}`).join('\n');
    }
    return header;
  }).join('\n\n');
}

export function formatNotes(notes: any[]): string {
  if (!notes?.length) {
    return '(No body-language observations were captured — the camera may have been off.)';
  }
  return notes.map((n) => `- [${n?.at ?? 0}s] ${n?.note ?? ''}`).join('\n');
}

export function buildUserPrompt(args: {
  objective: string; persona: string; rubric: RubricCriterion[];
  notes: any[]; transcript: any[];
}): string {
  return `## Scenario Objective\n${args.objective}\n\n`
    + `## Character Context\n${args.persona}\n\n`
    + `## Scoring Rubric\n${formatRubric(args.rubric)}\n\n`
    + `## Body-Language Observations\n${formatNotes(args.notes)}\n\n`
    + `## Conversation Transcript\n${formatTranscript(args.transcript)}`;
}

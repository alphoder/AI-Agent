/**
 * Client dossier + refined persona — a port of apps/ai-service/src/routes/brief.py.
 *
 * The prompt is the easy part. What matters here is everything that decides a
 * response is unusable: valid JSON is not the same as a usable file, a brief
 * that coaches defeats the point of the exercise, and a polish pass that quietly
 * changes an age or a premium contradicts the file the trainee just read.
 */

export const ATTEMPTS = 4;

/**
 * Seconds to wait before retrying. A rate limit is waited out on Gemini's own
 * terms where it gives them (RetryInfo `retryDelay`), otherwise long enough to
 * leave the quota minute. Everything else backs off gently: a malformed JSON
 * body is not helped by waiting.
 *
 * Bulk generation runs hundreds of these back to back, so a 429 is routine. A
 * 1.5s backoff just burns the retries inside the same quota minute and the whole
 * scenario fails.
 */
export function backoff(status: number | null, bodyText: string, attempt: number): number {
  if (status === 429) {
    const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(bodyText || '');
    if (m) return Math.min(45.0, Number(m[1]) + 1.0);
    return Math.min(45.0, 20.0 * (attempt + 1));
  }
  return 1.5 * (attempt + 1);
}

/**
 * What would make this brief unusable on the module page. Mirrors the committed
 * check in api/src/db/briefs.test.ts: whatever is rejected here must not be able
 * to reach briefs.ts, and whatever that test rejects must be caught here first.
 */
export function shapeProblems(out: any): string[] {
  const problems: string[] = [];
  const b = out?.brief;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return ['no brief object'];

  for (const f of ['name', 'headline', 'situation', 'manner']) {
    if (!String(b[f] ?? '').trim()) problems.push(`brief.${f} empty`);
  }
  for (const f of ['life', 'pressures', 'standing', 'unknowns', 'facts']) {
    if (!Array.isArray(b[f]) || !b[f].length) problems.push(`brief.${f} empty`);
  }
  if (Array.isArray(b.facts)) {
    if (b.facts.some((f: any) => !String(f?.label ?? '').trim() || !String(f?.value ?? '').trim())) {
      problems.push('a fact has a blank label or value');
    }
  }

  const q = out?.quiz;
  if (!q || typeof q !== 'object' || !String(q.question ?? '').trim()) {
    problems.push('quiz has no question');
  } else {
    const opts = Array.isArray(q.options) ? q.options : [];
    const ids = opts.map((o: any) => String(o?.id ?? '').trim());
    if (ids.filter(Boolean).length < 2) problems.push('quiz has fewer than two usable options');
    if (opts.some((o: any) => !String(o?.text ?? '').trim())) problems.push('a quiz option has no text');
    if (!ids.includes(String(q.correct ?? '').trim())) problems.push('quiz.correct is not one of the options');
  }

  const ex = out?.exchange;
  if (!Array.isArray(ex) || ex.length < 2) {
    problems.push('exchange too short');
  } else {
    if (ex.some((t: any) => !String(t?.line ?? '').trim())) problems.push('an exchange turn has no line');
    if (!ex.some((t: any) => t?.speaker === 'client')) problems.push('exchange has no client line');
  }
  return problems;
}

/** Phrases that mean the model slipped into coaching. Checked on the whole brief. */
const COACHING = new RegExp(
  '\\b(you should|you can|you could|you must|your job|the agent should|'
  + 'try to|make sure to|the key is|start by|open with|lead with|'
  + 'objection|pitch|rapport|technique|approach them|win them|'
  + 'handle (?:him|her|them)|convince|persuade|close (?:him|her|them))\\b',
  'gi',
);

export function coachingLeaks(text: string): string[] {
  return [...(text || '').matchAll(COACHING)].map((m) => m[0]);
}

/** Bare numbers stated in a persona. Ages, years, counts, premiums: canon. */
function numbers(text: string): Set<string> {
  return new Set([...(text || '').matchAll(/\b\d[\d,]*\b/g)].map((m) => m[0]));
}

/**
 * Numbers the polish pass dropped or invented. A persona that changes its own
 * facts contradicts the file the trainee just read.
 */
export function factDrift(original: string, refined: string): string[] {
  const before = numbers(original);
  const after = numbers(refined);
  const gone = [...before].filter((n) => !after.has(n)).sort().map((n) => `-${n}`);
  const added = [...after].filter((n) => !before.has(n)).sort().map((n) => `+${n}`);
  return [...gone, ...added];
}

export function briefText(b: any): string {
  const join = (v: unknown) => (Array.isArray(v) ? v.join(' ') : '');
  return [
    String(b?.headline ?? ''),
    join(b?.life),
    String(b?.situation ?? ''),
    join(b?.pressures),
    join(b?.standing),
    String(b?.manner ?? ''),
    join(b?.unknowns),
  ].join(' ');
}

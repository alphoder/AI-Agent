/**
 * Checks the generated client dossiers are actually usable by the module page.
 *
 * briefs.ts is written by a model and cast `as unknown as Record<string, ScenarioBrief>`,
 * so tsc proves nothing about its contents. A brief missing `life` or with a `correct`
 * answer that is not one of its own options renders an empty or broken Learn step,
 * which looks identical to "no data yet".
 *
 * Run: npx tsx src/db/briefs.test.ts
 */
import assert from 'node:assert/strict';
import { SCENARIO_BRIEFS } from '@avatar-platform/shared';
import type { ScenarioBrief } from '@avatar-platform/shared';
import { ALL_SEED_SCENARIOS } from './scenarios/all';

const entries = Object.entries(SCENARIO_BRIEFS) as [string, ScenarioBrief][];
assert.ok(entries.length > 0, 'no briefs are committed');

const titles = new Set(ALL_SEED_SCENARIOS.map((s) => s.title));
const problems: string[] = [];
const note = (title: string, why: string) => problems.push(`${title}: ${why}`);

for (const [title, b] of entries) {
  // A brief keyed to a title no scenario has is dead weight the seed will never apply.
  if (!titles.has(title)) note(title, 'no scenario has this title');

  const c = b?.brief;
  if (!c) { note(title, 'no brief object'); continue; }

  for (const f of ['name', 'headline', 'situation', 'manner'] as const) {
    if (typeof c[f] !== 'string' || !c[f].trim()) note(title, `brief.${f} is empty`);
  }
  for (const f of ['life', 'pressures', 'standing', 'unknowns'] as const) {
    if (!Array.isArray(c[f]) || c[f].length === 0) note(title, `brief.${f} is empty`);
  }
  if (!Array.isArray(c.facts) || c.facts.length === 0) note(title, 'brief.facts is empty');
  else if (c.facts.some((f) => !f?.label?.trim() || !f?.value?.trim())) note(title, 'a fact has a blank label or value');

  const q = b.quiz;
  if (!q?.question?.trim()) note(title, 'quiz has no question');
  else {
    const ids = (q.options ?? []).map((o) => o.id);
    if (ids.length < 2) note(title, 'quiz has fewer than two options');
    // The whole quiz is broken if the right answer is not on the list.
    if (!ids.includes(q.correct)) note(title, `quiz.correct "${q.correct}" is not one of [${ids.join(',')}]`);
    if ((q.options ?? []).some((o) => !o?.text?.trim())) note(title, 'a quiz option has no text');
  }

  const ex = b.exchange;
  if (!Array.isArray(ex) || ex.length < 2) note(title, 'exchange is too short to show');
  else {
    if (ex.some((t) => t.speaker !== 'agent' && t.speaker !== 'client')) note(title, 'exchange has an unknown speaker');
    if (ex.some((t) => !t?.line?.trim())) note(title, 'an exchange turn has no line');
    // The client is the point of the exchange; agent-only is not a model exchange.
    if (!ex.some((t) => t.speaker === 'client')) note(title, 'exchange has no client line');
  }
}

const missing = ALL_SEED_SCENARIOS.filter((s) => !SCENARIO_BRIEFS[s.title]);

console.log(`${entries.length} briefs checked, ${ALL_SEED_SCENARIOS.length} scenarios in the catalogue`);
if (missing.length) console.log(`${missing.length} scenario(s) still have no dossier (their Learn step falls back)`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.log(`  - ${p}`);
  if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);
}
assert.equal(problems.length, 0, 'briefs have structural problems, see above');
console.log('briefs: all checks passed');

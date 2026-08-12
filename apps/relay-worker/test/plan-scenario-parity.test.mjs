/**
 * Plan shaping and scenario normalisation vs the real Python.
 *
 * shapePlan decides which tasks survive into someone's journey; normalise
 * decides the rubric weights a scenario is graded on forever after. Both are
 * pure, both are fiddly, so both are diffed against Python rather than reasoned
 * about.
 *
 * Run: node --experimental-strip-types --test test/plan-scenario-parity.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { catalogueText, shapePlan, unlockDay } from '../src/plan.ts';
import { normalise } from '../src/scenario.ts';

const AI = decodeURIComponent(new URL('../../ai-service', import.meta.url).pathname);

function py(fn, args) {
  const code = `
import json, sys
sys.path.insert(0, sys.argv[1])
fn, args = sys.argv[2], json.loads(sys.argv[3])
if fn == 'shape':
    from src.routes.plan import _shape
    out = _shape(args[0], args[1])
elif fn == 'unlock':
    from src.routes.plan import unlock_day
    out = unlock_day(args[0], args[1])
elif fn == 'catalogue':
    from src.routes.plan import _catalogue_text, CatalogueItem
    out = _catalogue_text([CatalogueItem(**c) for c in args[0]], args[1], args[2])
elif fn == 'normalise':
    from src.routes.scenario import _normalise
    out = _normalise(args[0], args[1])
print(json.dumps(out))
`;
  const raw = execFileSync('python3', ['-c', code, AI, fn, JSON.stringify(args)], {
    encoding: 'utf8',
    env: { ...process.env, GEMINI_API_KEY: 'x', INTERNAL_API_KEY: 'x', WS_TICKET_SECRET: 'x' },
  }).trim().split('\n');
  return JSON.parse(raw[raw.length - 1]);
}

// --- plan -------------------------------------------------------------------
const PLAN_CASES = {
  'a normal week': { headline: 'Week one', days: [
    { focus: 'Openings', tasks: [{ type: 'module', scenarioId: 'a', why: 'read first' }, { type: 'call', scenarioId: 'a', why: 'then call' }] },
    { focus: 'Objections', tasks: [{ type: 'call', scenarioId: 'b', why: 'price' }] },
  ] },
  'same scenario twice in a day is deliberate': { days: [
    { focus: 'f', tasks: [{ type: 'module', scenarioId: 'x' }, { type: 'call', scenarioId: 'x' }] },
  ] },
  'a真 duplicate is dropped': { days: [
    { focus: 'f', tasks: [{ type: 'call', scenarioId: 'x' }, { type: 'call', scenarioId: 'x' }] },
  ] },
  'unknown task type is dropped': { days: [
    { focus: 'f', tasks: [{ type: 'meditate', scenarioId: 'x' }, { type: 'call', scenarioId: 'y' }] },
  ] },
  'a day with no usable tasks vanishes but does not renumber': { days: [
    { focus: 'gone', tasks: [{ type: 'call', scenarioId: '' }] },
    { focus: 'kept', tasks: [{ type: 'call', scenarioId: 'z' }] },
  ] },
  'more than three tasks are cut': { days: [
    { focus: 'f', tasks: [1, 2, 3, 4, 5].map((n) => ({ type: 'call', scenarioId: `s${n}` })) },
  ] },
  'over-long strings are trimmed': { headline: 'h'.repeat(200), days: [
    { focus: 'f'.repeat(100), tasks: [{ type: 'call', scenarioId: 'a', why: 'w'.repeat(300) }] },
  ] },
  'empty': {},
};

for (const [label, out] of Object.entries(PLAN_CASES)) {
  test(`shapePlan matches python: ${label}`, () => {
    assert.deepEqual(shapePlan(out, 7), py('shape', [out, 7]));
  });
}

test('unlockDay matches python across the grid', () => {
  for (const intensity of ['gentle', 'balanced', 'hard', 'nonsense']) {
    for (const diff of ['beginner', 'intermediate', 'advanced', '', 'ADVANCED']) {
      assert.equal(unlockDay(intensity, diff), py('unlock', [intensity, diff]), `${intensity}/${diff}`);
    }
  }
});

test('catalogueText matches python, including the week offset', () => {
  const items = [
    { id: 'a', title: 'Cold call', difficulty: 'beginner', tags: ['cold', 'life'], summary: 'A cold call.' },
    { id: 'b', title: 'CFO', difficulty: 'advanced', tags: [], summary: '' },
  ];
  for (const week of [1, 2, 3]) {
    assert.equal(catalogueText(items, 'balanced', week), py('catalogue', [items, 'balanced', week]), `week ${week}`);
  }
});

// --- scenario ---------------------------------------------------------------
const SCENARIO_CASES = {
  'weights already sum to 100': { character: 'A man.', rubric: [
    { name: 'A', description: 'd', weight: 60 }, { name: 'B', description: 'd', weight: 40 }] },
  'weights need rescaling': { character: 'A man.', rubric: [
    { name: 'A', weight: 3 }, { name: 'B', weight: 1 }] },
  'weights that do not divide evenly': { character: 'A man.', rubric: [
    { name: 'A', weight: 1 }, { name: 'B', weight: 1 }, { name: 'C', weight: 1 }] },
  'a criterion with no name is dropped': { character: 'x', rubric: [
    { name: '', weight: 50 }, { name: 'B', weight: 50 }] },
  'junk weight becomes 1': { character: 'x', rubric: [
    { name: 'A', weight: 'abc' }, { name: 'B', weight: 99 }] },
  'more than five criteria are cut': { character: 'x', rubric:
    [1, 2, 3, 4, 5, 6].map((n) => ({ name: `C${n}`, weight: 10 })) },
  'unknown category falls back to sales': { character: 'x', category: 'astrology', rubric: [{ name: 'A', weight: 100 }] },
  'tags are slugged and deduped': { character: 'x', category: 'interview',
    tags: ['Cold Call', 'cold-call', 'Salary!!', '', 'a'.repeat(40)], rubric: [{ name: 'A', weight: 100 }] },
  'unknown difficulty becomes intermediate': { character: 'x', difficulty: 'impossible', rubric: [{ name: 'A', weight: 100 }] },
  'voice gender defaults to female': { character: 'x', voice_gender: 'robot', rubric: [{ name: 'A', weight: 100 }] },
  'no title gets the fallback': { character: 'x', rubric: [{ name: 'A', weight: 100 }] },
  'empty everything': {},
};

for (const [label, out] of Object.entries(SCENARIO_CASES)) {
  test(`normalise matches python: ${label}`, () => {
    assert.deepEqual(normalise(out, 'hi'), py('normalise', [out, 'hi']));
  });
}

test('rescaled rubric weights always sum to 100', () => {
  for (const weights of [[3, 1], [1, 1, 1], [7, 13, 29], [1], [50, 50, 50, 50]]) {
    const out = normalise({ character: 'x', rubric: weights.map((w, i) => ({ name: `C${i}`, weight: w })) }, 'en');
    assert.equal(out.rubric.reduce((n, c) => n + c.weight, 0), 100, weights.join('+'));
  }
});

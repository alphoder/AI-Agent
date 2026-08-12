/**
 * Brief validators vs the real Python. These decide whether a generated dossier
 * is written or thrown away, so a difference means either broken Learn steps
 * reaching the app or good briefs being discarded.
 *
 * Run: node --experimental-strip-types --test test/brief-parity.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { backoff, coachingLeaks, factDrift, shapeProblems } from '../src/brief.ts';

const AI = decodeURIComponent(new URL('../../ai-service', import.meta.url).pathname);

function py(fn, args) {
  const code = `
import json, re, sys
sys.path.insert(0, sys.argv[1])
from src.routes.brief import _shape_problems, _fact_drift, _COACHING, _backoff
fn, args = sys.argv[2], json.loads(sys.argv[3])
if fn == 'shape': out = _shape_problems(args[0])
elif fn == 'drift': out = _fact_drift(args[0], args[1])
elif fn == 'coach': out = _COACHING.findall(args[0])
print(json.dumps(out))
`;
  const raw = execFileSync('python3', ['-c', code, AI, fn, JSON.stringify(args)], {
    encoding: 'utf8',
    env: { ...process.env, GEMINI_API_KEY: 'x', INTERNAL_API_KEY: 'x', WS_TICKET_SECRET: 'x' },
  }).trim().split('\n');
  return JSON.parse(raw[raw.length - 1]);
}

const GOOD = {
  brief: {
    name: 'Suresh Nair', headline: 'IT Team Lead, Pune',
    situation: 'Reviewing his cover after a colleague fell ill.',
    manner: 'Polite but time-pressed.',
    life: ['Wakes at six.'], pressures: ['Home loan.'], standing: ['Existing endowment.'],
    unknowns: ['His actual cover amount.'],
    facts: [{ label: 'Employer', value: 'Global Tech' }],
  },
  quiz: {
    question: 'What is pressing on him?',
    options: [{ id: 'a', text: 'The loan' }, { id: 'b', text: 'Nothing' }],
    correct: 'a',
  },
  exchange: [{ speaker: 'client', line: 'Who is this?' }, { speaker: 'agent', line: 'Good morning.' }],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

const SHAPE_CASES = {
  'a good brief': GOOD,
  'no brief object': { quiz: GOOD.quiz },
  'blank name': (() => { const g = clone(GOOD); g.brief.name = '   '; return g; })(),
  'empty life array': (() => { const g = clone(GOOD); g.brief.life = []; return g; })(),
  'fact with blank value': (() => { const g = clone(GOOD); g.brief.facts = [{ label: 'x', value: '' }]; return g; })(),
  'quiz option with blank id': (() => { const g = clone(GOOD); g.quiz.options[0].id = ''; return g; })(),
  'quiz correct not an option': (() => { const g = clone(GOOD); g.quiz.correct = 'zzz'; return g; })(),
  'quiz option with no text': (() => { const g = clone(GOOD); g.quiz.options[1].text = ' '; return g; })(),
  'exchange too short': (() => { const g = clone(GOOD); g.exchange = [g.exchange[0]]; return g; })(),
  'exchange with no client line': (() => { const g = clone(GOOD); g.exchange = [{ speaker: 'agent', line: 'hi' }, { speaker: 'agent', line: 'there' }]; return g; })(),
  'exchange turn with no line': (() => { const g = clone(GOOD); g.exchange[1].line = ''; return g; })(),
  'everything missing': {},
};

for (const [label, input] of Object.entries(SHAPE_CASES)) {
  test(`shapeProblems matches python: ${label}`, () => {
    assert.deepEqual(shapeProblems(input), py('shape', [input]), label);
  });
}

const DRIFT_CASES = [
  ['Suresh is 38 with 2 kids and a 45,00,000 loan', 'Suresh is 38 with 2 kids'],
  ['age 38', 'age 42'],
  ['no numbers here', 'still none'],
  ['1 2 3', '3 2 1'],
  ['premium 12,500', 'premium 12500'],
];
for (const [a, b] of DRIFT_CASES) {
  test(`factDrift matches python: "${a.slice(0, 28)}"`, () => {
    assert.deepEqual(factDrift(a, b), py('drift', [a, b]));
  });
}

const COACH_CASES = [
  'He is a busy man who dislikes cold calls.',
  'You should open with a question about his family.',
  'The key is rapport. Try to handle him gently and convince him.',
  'His objection is usually price.',
  'Make sure to lead with the pitch and close them fast.',
];
for (const text of COACH_CASES) {
  test(`coaching detection matches python: "${text.slice(0, 30)}"`, () => {
    assert.deepEqual(coachingLeaks(text), py('coach', [text]));
  });
}

test('backoff waits out a rate limit on Gemini terms', () => {
  assert.equal(backoff(429, '{"retryDelay":"27s"}', 0), 28);
  assert.equal(backoff(429, '{"retryDelay":"90s"}', 0), 45);   // capped
  assert.equal(backoff(429, 'no detail', 0), 20);
  assert.equal(backoff(429, 'no detail', 2), 45);              // capped
  assert.equal(backoff(500, '', 0), 1.5);                      // not a rate limit
  assert.equal(backoff(null, '', 1), 3);
});

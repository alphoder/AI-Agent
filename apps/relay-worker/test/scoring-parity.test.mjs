/**
 * Scoring parity: the same inputs through Python's _grade/_overall and the
 * TypeScript port, compared exactly.
 *
 * This is the port I least want to get subtly wrong — grade() is what stops the
 * model deciding how much each criterion is worth, and overall() is the number
 * on the report. Reasoning about it is not enough; run both and diff.
 *
 * Run: node --experimental-strip-types --test test/scoring-parity.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { grade, overall } from '../src/scoring.ts';

const AI = decodeURIComponent(new URL('../../ai-service', import.meta.url).pathname);

/** Run the real Python implementation on the same input. */
function python(returned, rubric) {
  const code = `
import json, sys
sys.path.insert(0, sys.argv[1])
from src.core.scoring import _grade, _overall
payload = json.loads(sys.argv[2])
graded = _grade(payload["returned"], payload["rubric"])
print(json.dumps({"graded": graded, "overall": _overall(graded)}))
`;
  const out = execFileSync('python3', [
    '-c', code, AI, JSON.stringify({ returned, rubric }),
  ], { encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: 'x', INTERNAL_API_KEY: 'x', WS_TICKET_SECRET: 'x' } });
  // structlog writes its off-rubric warning to stdout, ahead of our JSON.
  const lines = out.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

const RUBRIC = [
  { name: 'Active Needs Discovery', description: 'd', weight: 25 },
  { name: 'Customized Solution Framing', description: 'd', weight: 25 },
  { name: 'Standard Objection Handling', description: 'd', weight: 30 },
  { name: 'Committed Action Close', description: 'd', weight: 20 },
];

const CASES = {
  'straightforward': [
    { criterion_name: 'Active Needs Discovery', score: 4, weight: 25, justification: 'ok' },
    { criterion_name: 'Customized Solution Framing', score: 3, weight: 25, justification: 'ok' },
    { criterion_name: 'Standard Objection Handling', score: 5, weight: 30, justification: 'ok' },
    { criterion_name: 'Committed Action Close', score: 2, weight: 20, justification: 'ok' },
  ],
  'model drifted the weights': [
    { criterion_name: 'Active Needs Discovery', score: 4, weight: 90, justification: 'ok' },
    { criterion_name: 'Customized Solution Framing', score: 3, weight: 5, justification: 'ok' },
    { criterion_name: 'Standard Objection Handling', score: 5, weight: 3, justification: 'ok' },
    { criterion_name: 'Committed Action Close', score: 2, weight: 2, justification: 'ok' },
  ],
  'model re-cased and re-punctuated names': [
    { criterion_name: 'active needs   discovery', score: 4, justification: 'ok' },
    { criterion_name: 'Customized-Solution-Framing!', score: 3, justification: 'ok' },
    { criterion_name: 'STANDARD OBJECTION HANDLING', score: 5, justification: 'ok' },
    { criterion_name: 'Committed Action Close', score: 2, justification: 'ok' },
  ],
  'model invented a criterion': [
    { criterion_name: 'Active Needs Discovery', score: 4, justification: 'ok' },
    { criterion_name: 'Charisma And Vibes', score: 5, weight: 50, justification: 'invented' },
  ],
  'scores out of range': [
    { criterion_name: 'Active Needs Discovery', score: 7, justification: 'ok' },
    { criterion_name: 'Customized Solution Framing', score: -1, justification: 'ok' },
    { criterion_name: 'Standard Objection Handling', score: 'abc', justification: 'ok' },
    { criterion_name: 'Committed Action Close', score: null, justification: 'ok' },
  ],
  'fractional scores': [
    { criterion_name: 'Active Needs Discovery', score: 3.5, justification: 'ok' },
    { criterion_name: 'Customized Solution Framing', score: 4.25, justification: 'ok' },
  ],
  'nothing matched the rubric': [
    { criterion_name: 'Totally Unrelated', score: 5, weight: 100, justification: 'x' },
  ],
  'model returned nothing': [],
  'alternate key name': [
    { name: 'Active Needs Discovery', score: 4, justification: 'ok' },
  ],
};

for (const [label, returned] of Object.entries(CASES)) {
  test(`grade+overall match python: ${label}`, () => {
    const py = python(returned, RUBRIC);
    const mine = grade(returned, RUBRIC);
    assert.deepEqual(
      JSON.parse(JSON.stringify(mine)), py.graded,
      `graded criteria differ for "${label}"`,
    );
    assert.equal(overall(mine), py.overall, `overall differs for "${label}"`);
  });
}

test('an invented criterion cannot move the grade', () => {
  const honest = [{ criterion_name: 'Active Needs Discovery', score: 4, justification: '' }];
  const withJunk = [...honest, { criterion_name: 'Charisma', score: 5, weight: 999, justification: '' }];
  assert.equal(overall(grade(honest, RUBRIC)), overall(grade(withJunk, RUBRIC)));
});

test('the rubric weight wins over whatever the model claimed', () => {
  const drifted = [
    { criterion_name: 'Active Needs Discovery', score: 5, weight: 1 },
    { criterion_name: 'Committed Action Close', score: 1, weight: 99 },
  ];
  const graded = grade(drifted, RUBRIC);
  assert.equal(graded[0].weight, 25, 'must use the rubric weight, not the model’s 1');
  assert.equal(graded[1].weight, 20, 'must use the rubric weight, not the model’s 99');
});

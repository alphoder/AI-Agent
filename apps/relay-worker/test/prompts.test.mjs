/**
 * src/prompts.ts is generated from the Python. If a prompt drifts during the
 * port nothing crashes — the model quietly behaves differently and scores move.
 *
 * Python's own parser is the authority here: ast.literal_eval gives the real
 * value of each constant, seams and escapes already resolved, so this compares
 * strings rather than guessing at source syntax.
 *
 * Run: node --test test/prompts.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const TS = readFileSync(new URL('../src/prompts.ts', import.meta.url), 'utf8');
const ROUTES = decodeURIComponent(new URL('../../ai-service/src/routes/', import.meta.url).pathname);

const SOURCE_OF = {
  PROMPT_SYSTEM: ['prompt.py', '_SYSTEM'],
  DRILL_SYSTEM: ['drill.py', '_SYSTEM'],
  NOTES_SYSTEM: ['notes.py', '_SYSTEM'],
  BRIEF_SYSTEM: ['brief.py', '_SYSTEM'],
  PLAN_SYSTEM: ['plan.py', '_SYSTEM'],
  SCENARIO_SYSTEM: ['scenario.py', '_SYSTEM'],
  SCENARIO_STAY_IN_CHARACTER: ['scenario.py', '_STAY_IN_CHARACTER'],
  SPEECH_SYSTEM: ['speech.py', '_SYSTEM'],
  EVALUATION_SYSTEM: ['../core/scoring.py', 'EVALUATION_SYSTEM_PROMPT'],
  BEGINNER_RUBRIC: ['../core/scoring.py', 'BEGINNER_RUBRIC'],
  INTERMEDIATE_RUBRIC: ['../core/scoring.py', 'INTERMEDIATE_RUBRIC'],
  ADVANCED_RUBRIC: ['../core/scoring.py', 'ADVANCED_RUBRIC'],
};

/** The true value of a module-level constant, via Python's parser. */
function pythonValue(file, name) {
  const code = `
import ast, sys, json
tree = ast.parse(open(sys.argv[1]).read())
for node in tree.body:
    if isinstance(node, ast.Assign) and getattr(node.targets[0], 'id', None) == sys.argv[2]:
        print(json.dumps(ast.literal_eval(node.value)))
        break
`;
  return JSON.parse(execFileSync('python3', ['-c', code, ROUTES + file, name], { encoding: 'utf8' }));
}

const found = [...TS.matchAll(/^export const (\w+) = (.*);$/gm)];

test('every generated prompt has a known source', () => {
  assert.ok(found.length >= 8, `expected 8 prompts, found ${found.length}`);
  for (const [, name] of found) assert.ok(SOURCE_OF[name], `${name} has no source mapped`);
});

test('each constant is identical to its Python source', () => {
  for (const [, name, literal] of found) {
    const [file, constant] = SOURCE_OF[name];
    // Strings and the rubric arrays alike: compare parsed value to parsed value.
    assert.deepEqual(
      JSON.parse(literal), pythonValue(file, constant),
      `${name} drifted from ${file}:${constant}`,
    );
  }
});

test('the default rubrics still carry their weights', () => {
  for (const name of ['BEGINNER_RUBRIC', 'INTERMEDIATE_RUBRIC', 'ADVANCED_RUBRIC']) {
    const entry = found.find(([, n]) => n === name);
    const rubric = JSON.parse(entry[2]);
    assert.ok(rubric.length >= 4, `${name} lost criteria`);
    for (const c of rubric) {
      assert.ok(c.name, `${name} has a criterion with no name`);
      assert.ok(Number(c.weight) > 0, `${name}: ${c.name} has no weight`);
    }
  }
});

/**
 * The conversational numbers are parsed out of free text the model wrote. If a
 * parser silently returns null the UI shows "not measured yet" forever; if it
 * matches the wrong number it shows a confident lie. Both are worth a check.
 *
 * Run: npx tsx src/services/analytics-service.test.ts
 */
import assert from 'node:assert/strict';
import { __test, parseRange } from './analytics-service';

const { talkRatioOf, questionsOf, fillersOf, criteriaFrom } = __test;

// The exact block the scorer is told to emit (scoring.py EVALUATION_SYSTEM_PROMPT).
const REAL = `### 📊 CONVERSATIONAL ANALYTICS
- **Talk-to-Listen Ratio:** 42% Learner / 58% Avatar (ideal learner ratio is 35%-45% in discovery)
- **Question Frequency:** 7 questions asked (4 open-ended, 3 closed-ended)
- **Filler Word Usage:** 12 filler words detected (e.g., "um", "uh", "like", "you know")
- **Ethical Compliance Flag:** ✅ PASSED (No mis-selling)

You opened well and kept the customer talking.`;

{
  assert.equal(talkRatioOf(REAL), 42, 'takes the learner side, not the avatar side');
  assert.equal(questionsOf(REAL), 7, 'takes the total, not the open-ended breakdown');
  assert.equal(fillersOf(REAL), 12);
}

// Formatting drift: the model does not always bold, space or capitalise identically.
{
  const loose = 'Talk-to-Listen Ratio: 38 % Learner\nquestion frequency: 3 questions\nFiller word usage: 0 filler words';
  assert.equal(talkRatioOf(loose), 38);
  assert.equal(questionsOf(loose), 3);
  assert.equal(fillersOf(loose), 0, 'zero fillers is a real result, not a miss');
}

// Nothing to parse: null means "not measured", which the UI must show honestly.
{
  assert.equal(talkRatioOf(null), null);
  assert.equal(talkRatioOf('Great call, well done.'), null);
  assert.equal(questionsOf(''), null);
  assert.equal(fillersOf(null), null);
}

// Out-of-range values are rejected rather than rendered.
{
  assert.equal(talkRatioOf('Talk-to-Listen Ratio: 420% Learner'), null, 'a 3-digit percent over 100 is not a ratio');
}

// Criterion names come from the DB as `criterion_name`. Guessing `name` here
// silently produced an empty Skills tile that looked like "no data yet".
{
  const rows = [
    { criteria_scores: [{ criterion_name: 'Discovery', score: 3 }, { criterion_name: 'Closing', score: 5 }] },
    { criteria_scores: [{ criterion_name: 'Discovery', score: 4 }] },
  ];
  const out = criteriaFrom(rows);
  assert.deepEqual(out, [
    { name: 'Closing', score: 100 },
    { name: 'Discovery', score: 70 },
  ], '1-5 scores normalise to 0-100 and average across calls, best first');

  assert.deepEqual(criteriaFrom([{ criteria_scores: null }]), [], 'no scores is empty, not a crash');
  assert.deepEqual(criteriaFrom([{ criteria_scores: [{ criterion_name: '', score: 3 }] }]), [], 'unnamed criteria are dropped');
  assert.deepEqual(criteriaFrom([{ criteria_scores: [{ criterion_name: 'Already percent', score: 82 }] }]),
    [{ name: 'Already percent', score: 82 }], 'a score above 5 is already a percentage');
}

// Range parsing is a whitelist.
{
  assert.equal(parseRange('7d'), '7d');
  assert.equal(parseRange('all'), 'all');
  assert.equal(parseRange(undefined), '30d');
  assert.equal(parseRange('; DROP TABLE sessions'), '30d');
}

console.log('analytics: all checks passed');

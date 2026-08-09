/**
 * gradeFor decides which list every scenario lands in: Completed, To improve, or
 * back in Scenarios. Getting a boundary wrong silently moves a learner's work.
 *
 * Run: npx tsx packages/shared/src/journey.test.ts
 */
import assert from 'node:assert/strict';
import { gradeFor, masteryFor, PASS_MARK, FAIL_MARK } from './journey';

// --- boundaries are inclusive at the mark ---
assert.equal(gradeFor(PASS_MARK), 'completed', 'exactly the pass mark passes');
assert.equal(gradeFor(PASS_MARK - 0.1), 'attempted', 'just under the mark does not');
assert.equal(gradeFor(FAIL_MARK), 'attempted', 'exactly the fail mark is still an attempt');
assert.equal(gradeFor(FAIL_MARK - 0.1), 'failed');
assert.equal(gradeFor(100), 'completed');
assert.equal(gradeFor(0), 'failed');

// --- never tried vs tried and unscored ---
// A finished call with no score is a fail, not a blank: the learner did the work and
// has something to retry. Only an untouched scenario is 'none'.
assert.equal(gradeFor(null, 0), 'none', 'never opened');
assert.equal(gradeFor(null, 2), 'failed', 'attempted but nothing scored');

// --- the three buckets are exhaustive and disjoint ---
const seen = new Set([0, 25, 49.9, 50, 60, 69.9, 70, 85, 100].map((n) => gradeFor(n)));
assert.deepEqual([...seen].sort(), ['attempted', 'completed', 'failed']);

// --- grade and crown must never disagree ---
// PASS_MARK is MASTERY.silver, so anything that earns silver or gold is completed.
for (const s of [70, 75, 84, 85, 92, 100]) {
  assert.equal(gradeFor(s), 'completed', `${s} should be completed`);
  assert.ok(['silver', 'gold'].includes(masteryFor(s)), `${s} should hold a crown`);
}
for (const s of [0, 20, 49] ) assert.equal(masteryFor(s), 'none', `${s} earns no crown`);

console.log('journey grades: all checks passed');

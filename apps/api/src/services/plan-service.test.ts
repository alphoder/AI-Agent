/**
 * Checks for the two bits of plan logic that are easy to break and expensive to
 * get wrong: intake coercion (a trust boundary) and the difficulty ramp.
 *
 * Run: npx tsx src/services/plan-service.test.ts
 */
import assert from 'node:assert/strict';
import { normaliseIntake, __test } from './plan-service';

const { unlockDay } = __test;

// --- normaliseIntake: hostile input must never reach the model or the DB ---
{
  const clean = normaliseIntake({
    role: 'sales', industry: 'insurance', experience: 'some',
    outcomes: ['objections', 'cold_calls'], struggles: ['opening'],
    struggleNote: 'I freeze', minutesPerDay: 15, daysPerWeek: 5,
    org: 'Aarambh Labs', city: 'Lucknow', state: 'Uttar Pradesh', intensity: 'hard',
  });
  assert.equal(clean.role, 'sales');
  assert.equal(clean.intensity, 'hard');
  assert.deepEqual(clean.outcomes, ['objections', 'cold_calls']);
}

{
  // Unknown ids fall back to safe defaults rather than reaching the prompt.
  const junk = normaliseIntake({
    role: 'wizard', industry: '<script>', experience: 42,
    outcomes: ['objections', 'nope', 'cold_calls', 'interviews', 'hard_talks'],
    struggles: 'not-an-array', minutesPerDay: 999, daysPerWeek: 0,
    state: 'Atlantis', intensity: 'nightmare',
  });
  assert.equal(junk.role, 'other');
  assert.equal(junk.industry, 'other');
  assert.equal(junk.experience, 'some');
  assert.equal(junk.intensity, 'balanced');
  assert.equal(junk.state, '', 'an unknown state must not become a competition board');
  assert.deepEqual(junk.struggles, []);
  assert.equal(junk.minutesPerDay, 15, 'out-of-range minutes fall back');
  assert.equal(junk.daysPerWeek, 5);
  assert.ok(junk.outcomes.length <= 3, 'outcomes are capped');
  assert.ok(!junk.outcomes.includes('nope'));
}

{
  // Control characters are stripped: org/city render publicly on competition boards.
  const nasty = normaliseIntake({
    outcomes: ['objections'],
    org: 'Ev\u0000il\u001bCorp', city: 'x'.repeat(200), struggleNote: 'a'.repeat(500),
  });
  assert.ok(!/[\u0000-\u001f]/.test(nasty.org), 'control chars stripped from org');
  assert.equal(nasty.city.length, 60, 'city capped');
  assert.equal(nasty.struggleNote.length, 280, 'note capped');
}

// --- the difficulty ramp backstop ---
{
  // A beginner is never handed an advanced customer on day one, whatever the model says.
  assert.equal(unlockDay('gentle', 'advanced'), 10);
  assert.equal(unlockDay('balanced', 'advanced'), 7);
  assert.equal(unlockDay('balanced', 'intermediate'), 3);
  assert.equal(unlockDay('hard', 'advanced'), 3);
  assert.equal(unlockDay('balanced', 'beginner'), 1);
  // Unknown difficulty or intensity must not lock the plan out entirely.
  assert.equal(unlockDay('balanced', null), 1);
  assert.equal(unlockDay('made-up', 'advanced'), 1);
}

console.log('plan-service: all checks passed');

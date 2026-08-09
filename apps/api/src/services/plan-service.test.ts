/**
 * Checks for the two bits of plan logic that are easy to break and expensive to
 * get wrong: intake coercion (a trust boundary) and the difficulty ramp.
 *
 * Run: npx tsx src/services/plan-service.test.ts
 */
import assert from 'node:assert/strict';
import { normaliseIntake, __test } from './plan-service';
import { TASK_MINUTES } from '@avatar-platform/shared';
import { db } from '../config/database';

const { unlockDay, fitTheDay } = __test;

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

// --- the day budget backstop ---
{
  // The exact shape the model actually produced: one scenario done three ways,
  // 6 + 8 + 3 = 17 minutes against a stated 15. It happened on 11 days out of 14.
  const oneScenarioThreeWays = [
    { type: 'module' as const, scenarioId: 'A', why: 'learn it' },
    { type: 'call' as const, scenarioId: 'A', why: 'do it' },
    { type: 'drill' as const, scenarioId: 'A', why: 'again' },
  ];
  const kept = fitTheDay(oneScenarioThreeWays, 15);
  assert.equal(kept.length, 2, 'a third task on the same scenario is padding, not practice');
  assert.deepEqual(kept.map((t) => t.type), ['module', 'call'], 'keeps learn-then-do, drops the drill');
  const spent = kept.reduce((n, t) => n + TASK_MINUTES[t.type], 0);
  assert.ok(spent <= 15, `day must fit the stated budget, spent ${spent}`);
}

{
  // The per-scenario cap on its own, with budget removed as a factor: 6 + 8 + 3 = 17
  // fits inside 30 minutes comfortably, so only MAX_PER_SCENARIO_PER_DAY can drop the
  // drill. Without this case a 15-minute budget hides the cap entirely.
  const kept = fitTheDay([
    { type: 'module' as const, scenarioId: 'A', why: '' },
    { type: 'call' as const, scenarioId: 'A', why: '' },
    { type: 'drill' as const, scenarioId: 'A', why: '' },
  ], 30);
  assert.equal(kept.length, 2, 'the same scenario never appears three times, budget or not');
}

{
  // Variety survives: three different scenarios inside budget are all kept.
  const varied = [
    { type: 'module' as const, scenarioId: 'A', why: '' },  // 6
    { type: 'drill' as const, scenarioId: 'B', why: '' },   // 3
    { type: 'review' as const, scenarioId: 'C', why: '' },  // 5
  ];
  assert.equal(fitTheDay(varied, 15).length, 3, 'distinct scenarios are not trimmed when they fit');
}

{
  // A day is never returned empty: the first task survives a budget too small for it,
  // because a blank day reads as a broken plan.
  const kept = fitTheDay([{ type: 'call' as const, scenarioId: 'A', why: '' }], 5);
  assert.equal(kept.length, 1, 'the first task is always kept');
}

{
  // Over-budget later tasks are dropped, not reordered in.
  const kept = fitTheDay([
    { type: 'call' as const, scenarioId: 'A', why: '' },    // 8, fits
    { type: 'call' as const, scenarioId: 'B', why: '' },    // 8, would make 16 > 15
    { type: 'drill' as const, scenarioId: 'C', why: '' },   // 3, fits at 11
  ], 15);
  assert.deepEqual(kept.map((t) => t.scenarioId), ['A', 'C'], 'skips what does not fit, keeps what does');
}

console.log('plan-service: all checks passed');

// --- the week must advance, or extending overwrites the plan it follows -------
// nextWeek is the whole fix for a bug no unit test could see: no caller passed
// `week`, so it defaulted to 1 and the (user, week) upsert rewrote week 1 forever.
// Extending replaced the finished plan AND flipped its stored kind to 'extended',
// which reset the monthly build counter too.
void (async () => {
  const { nextWeek } = __test as unknown as {
    nextWeek: (userId: string, kind: string) => Promise<number>;
  };
  // Stub the single query it makes, so this stays pure with no database.
  const real = db.query;
  const withMax = (w: number) => { (db as { query: unknown }).query = async () => ({ rows: [{ w }] }); };

  withMax(0);
  assert.equal(await nextWeek('u', 'initial'), 1, 'a first-time learner starts at week 1');
  assert.equal(await nextWeek('u', 'extended'), 1, 'nothing to extend yet');

  withMax(1);
  assert.equal(await nextWeek('u', 'extended'), 2, 'extending moves to a NEW week, so it inserts');
  assert.equal(await nextWeek('u', 'initial'), 1, 'a rebuild replaces the week they are on');

  withMax(3);
  assert.equal(await nextWeek('u', 'extended'), 4);
  assert.equal(await nextWeek('u', 'initial'), 3, 'a rebuild on week 3 must not jump back to week 1');

  (db as { query: unknown }).query = real;
  console.log('plan-service: week checks passed');
  process.exit(0);
})();

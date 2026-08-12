/**
 * The pure logic in the port. A bug here is silent — a fabricated timestamp in
 * someone's notes reads as a real memory, and a mis-clamped score is just a
 * wrong number on a report.
 *
 * Run: node --experimental-strip-types --test test/text.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripInventedStamps, clamp, lines } from '../src/http.ts';
import { parseJsonish } from '../src/gemini.ts';

test('a stamp the learner really flagged survives', () => {
  assert.equal(
    stripInventedStamps('- [01:30] you rushed the open', 'noted at [01:30]'),
    '- [01:30] you rushed the open',
  );
});

test('a stamp the model invented is removed', () => {
  assert.equal(
    stripInventedStamps('- [02:15] this is where you noticed', 'no markers at all'),
    '- this is where you noticed',
  );
});

test('1:30 and 01:30 are the same moment', () => {
  // The gateway writes "1:30"; the model normalises to "01:30". A string
  // compare would strip a real marker.
  assert.equal(
    stripInventedStamps('- [01:30] good recovery', 'I flagged [1:30]'),
    '- [01:30] good recovery',
  );
});

test('notes with no stamps are returned untouched', () => {
  const note = '- you asked two good questions\n- close was rushed';
  assert.equal(stripInventedStamps(note, ''), note);
});

test('several stamps in one note are judged individually', () => {
  const out = stripInventedStamps('[00:10] real. [09:99] fake. [02:00] real.', '[0:10] and [2:00]');
  assert.ok(out.includes('[00:10]'), out);
  assert.ok(out.includes('[02:00]'), out);
  assert.ok(!out.includes('[09:99]'), out);
});

test('the global regex does not carry state between calls', () => {
  // /g regexes keep lastIndex; calling twice must not change the answer.
  const a = stripInventedStamps('[01:00] x', '[01:00]');
  const b = stripInventedStamps('[01:00] x', '[01:00]');
  assert.equal(a, b);
});

test('clamp matches the Python bounds', () => {
  assert.equal(clamp(50), 50);
  assert.equal(clamp(-5), 0);
  assert.equal(clamp(150), 100);
  assert.equal(clamp('73'), 73);
  assert.equal(clamp(null), 0);
  assert.equal(clamp('abc'), 0);
  assert.equal(clamp(7.9), 7);      // python int() truncates
});

test('lines slices to three FIRST, then drops blanks', () => {
  // Matches python: [x.strip() for x in v[:cap] if x.strip()] — the slice comes
  // before the filter, so a blank inside the first three costs you a slot.
  assert.deepEqual(lines(['a', ' b ', '', 'c', 'd']), ['a', 'b']);
  assert.deepEqual(lines(['a', 'b', 'c', 'd']), ['a', 'b', 'c']);
  assert.deepEqual(lines('not a list'), []);
  assert.deepEqual(lines(null), []);
});

test('parseJsonish survives what Gemini actually returns', () => {
  assert.deepEqual(parseJsonish('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonish('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonish('Here you go: {"a":1} hope that helps'), { a: 1 });
  assert.equal(parseJsonish('not json at all'), null);
  assert.equal(parseJsonish(null), null);
});

/**
 * Self-check for the one-minute drill topics.
 * Run: npx tsx packages/shared/src/topics.test.ts
 */
import assert from 'assert';
import { SPEAK_TOPICS, randomTopic } from './topics';

assert.ok(SPEAK_TOPICS.length >= 30, 'enough topics that repeats are rare');
assert.equal(new Set(SPEAK_TOPICS.map((t) => t.text)).size, SPEAK_TOPICS.length, 'topics are unique');
assert.ok(SPEAK_TOPICS.every((t) => t.text.trim().length > 0), 'no blank topics');
assert.ok(['opinion', 'abstract', 'scenario'].every((k) => SPEAK_TOPICS.some((t) => t.kind === k)),
  'all three kinds are represented');

// The whole point of `exclude`: never hand back the topic they just did.
const first = SPEAK_TOPICS[0].text;
for (let i = 0; i < 200; i++) {
  assert.notEqual(randomTopic(first).text, first, 'excluded topic must never be returned');
}

// Unknown/absent exclusions must still yield a topic rather than throw.
assert.ok(randomTopic().text, 'no exclusion still returns a topic');
assert.ok(randomTopic('a topic that does not exist').text, 'unknown exclusion is harmless');

// It must actually vary — a picker that always returns index 0 would pass everything above.
const seen = new Set(Array.from({ length: 200 }, () => randomTopic().text));
assert.ok(seen.size > 5, `picker must vary, saw ${seen.size} distinct topics`);

console.log('topics.test.ts: all checks passed');

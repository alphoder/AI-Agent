/**
 * Self-check for persona gender detection and voice filtering.
 * Run: npx tsx packages/shared/src/voices.test.ts
 */
import assert from 'assert';
import {
  personaGenderOf, voicesForPersona, GEMINI_VOICES, MALE_VOICES, FEMALE_VOICES,
} from './voices';

// --- the catalogue itself ---
assert.equal(GEMINI_VOICES.length, 30, '30 voices, verified against the live model');
assert.equal(MALE_VOICES.length + FEMALE_VOICES.length, 30, 'every voice is in exactly one group');
assert.ok(MALE_VOICES.length > 0 && FEMALE_VOICES.length > 0, 'both groups are populated');
assert.equal(new Set(GEMINI_VOICES.map((v) => v.id)).size, 30, 'voice ids are unique');

// --- stated female ---
assert.equal(
  personaGenderOf('Priya is a schoolteacher. She is busy and wants you off her phone.'),
  'female', 'she/her reads as female');
assert.equal(personaGenderOf('Mrs Sharma, a homemaker in Pune.'), 'female', 'honorific + role');

// --- stated male ---
assert.equal(
  personaGenderOf('Rajesh runs a shop. He is sceptical and his time is short.'),
  'male', 'he/his reads as male');
assert.equal(personaGenderOf('Mr Khan, a father of two.'), 'male', 'honorific + kinship');

// --- NOT stated: must be null so every voice stays on offer ---
assert.equal(personaGenderOf('A busy customer who has no time for cold calls.'), null,
  'ungendered prose commits to nothing');
assert.equal(personaGenderOf(''), null, 'empty is null');
assert.equal(personaGenderOf(null, undefined), null, 'nullish parts are null');
assert.equal(personaGenderOf('They are a cautious buyer.'), null, 'they/them is not a gender claim');
assert.equal(personaGenderOf('He and she both attend.'), null, 'a tie commits to nothing');

// substrings must not trigger: "the" contains "he", "usher" contains "she"
assert.equal(personaGenderOf('The usher shed the theme.'), null, 'word boundaries hold');

// --- filtering ---
assert.equal(voicesForPersona('male').length, MALE_VOICES.length, 'male persona -> male voices');
assert.equal(voicesForPersona('female').length, FEMALE_VOICES.length, 'female persona -> female voices');
assert.equal(voicesForPersona(null).length, 30, 'unstated persona -> every voice');
assert.ok(voicesForPersona('female').every((v) => v.gender === 'female'), 'no leakage across groups');

console.log('voices.test.ts: all checks passed');

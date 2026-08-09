/**
 * Self-check for the dev-login password compare.
 * Run: npx tsx src/routes/auth.test.ts
 */
import assert from 'assert';
import { passwordMatches } from './auth.routes';

const PASS = 'hfihdiugweifiewjfbifbi';

assert.equal(passwordMatches(PASS, PASS), true, 'correct password must match');
assert.equal(passwordMatches('', PASS), false, 'empty password must not match');
assert.equal(passwordMatches(PASS + 'x', PASS), false, 'longer password must not match');
assert.equal(passwordMatches(PASS.slice(0, -1), PASS), false, 'shorter password must not match');
assert.equal(passwordMatches('HFIHDIUGWEIFIEWJFBIFBI', PASS), false, 'compare is case-sensitive');

// The regression this guard exists for: same string length, twice the bytes.
// Before the byte-length compare this threw a RangeError → unauthenticated 500.
const multibyte = 'é'.repeat(PASS.length);
assert.equal(multibyte.length, PASS.length, 'fixture must match on string length');
assert.notEqual(Buffer.from(multibyte).length, Buffer.from(PASS).length, 'fixture must differ in bytes');
assert.equal(passwordMatches(multibyte, PASS), false, 'multi-byte password must return false, not throw');

console.log('auth.test.ts: all checks passed');

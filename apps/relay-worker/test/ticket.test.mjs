/**
 * The Worker rejects every connection if its HMAC verify disagrees by one byte
 * with the gateway that mints the tickets. This test signs with the gateway's
 * exact code path (node:crypto) and verifies with the Worker's (WebCrypto).
 *
 * Run: node --test test/ticket.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const SECRET = 'a-test-secret-that-is-not-short';

// --- the gateway's minter, copied verbatim from apps/api/src/utils/ws-ticket.ts
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function signWsTicket(sid, uid, ttlSec = 120) {
  const payload = b64url(Buffer.from(JSON.stringify({ sid, uid, exp: Math.floor(Date.now() / 1000) + ttlSec })));
  const sig = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}

// --- the Worker's verifier, copied verbatim from src/index.ts ---------------
function b64urlToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(b) {
  let s = '';
  const v = new Uint8Array(b);
  for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyTicket(token, secret) {
  if (!secret || !token || !token.includes('.')) return null;
  const cut = token.lastIndexOf('.');
  const payloadB64 = token.slice(0, cut);
  const sig = token.slice(cut + 1);
  const key = await crypto.webcrypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  if (!timingSafeEqual(bytesToB64url(mac), sig)) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    if (!data?.sid || !data?.uid) return null;
    if (Number(data.exp ?? 0) < Date.now() / 1000) return null;
    return data;
  } catch { return null; }
}

test('a ticket the gateway minted verifies in the Worker', async () => {
  const t = signWsTicket('019fece0-7dfb-776c-b381-e6d4e2fd4caa', 'user-42');
  const got = await verifyTicket(t, SECRET);
  assert.ok(got, 'gateway-signed ticket must verify');
  assert.equal(got.sid, '019fece0-7dfb-776c-b381-e6d4e2fd4caa');
  assert.equal(got.uid, 'user-42');
});

test('ids with base64url-significant characters survive the round trip', async () => {
  // '+' and '/' are exactly what plain base64 would mangle.
  const got = await verifyTicket(signWsTicket('a+b/c==', 'u/i+d'), SECRET);
  assert.equal(got.sid, 'a+b/c==');
  assert.equal(got.uid, 'u/i+d');
});

test('a tampered payload is rejected', async () => {
  const t = signWsTicket('sid-1', 'uid-1');
  const [p, s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ sid: 'sid-1', uid: 'ADMIN', exp: 2000000000 }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(await verifyTicket(`${forged}.${s}`, SECRET), null);
  assert.equal(await verifyTicket(`${p}.${s.slice(0, -1)}x`, SECRET), null);
});

test('an expired ticket is rejected', async () => {
  assert.equal(await verifyTicket(signWsTicket('sid', 'uid', -1), SECRET), null);
});

test('the wrong secret is rejected', async () => {
  assert.equal(await verifyTicket(signWsTicket('sid', 'uid'), 'different-secret'), null);
});

test('malformed input never throws', async () => {
  for (const bad of ['', '.', 'nodot', 'a.b', '....', 'x'.repeat(5000)]) {
    assert.equal(await verifyTicket(bad, SECRET), null, `should reject: ${bad.slice(0, 12)}`);
  }
});

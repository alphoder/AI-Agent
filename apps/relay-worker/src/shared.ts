/**
 * What both relays need: ticket auth, origin check, and the cost meter.
 *
 * Kept in one place because a difference between the two — a stricter ticket
 * check on one socket than the other — is a security hole that reads like a
 * refactor, and the meter disagreeing between them makes the cost numbers
 * unusable.
 */

export interface Env {
  GEMINI_API_KEY: string;          // key 1 — practice sessions
  GEMINI_PROMPT_API_KEY: string;   // key 2 — Bixy, so one cannot starve the other
  WS_TICKET_SECRET: string;
  INTERNAL_API_KEY: string;
  API_GATEWAY_URL: string;
  CORS_ORIGINS: string;
  GEMINI_LIVE_MODEL?: string;
  GEMINI_ASSISTANT_MODEL?: string;
}

export const GEMINI_WS =
  'https://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// --- ticket auth ------------------------------------------------------------
// Format (must match apps/api/src/utils/ws-ticket.ts):
//   base64url(json({sid, uid, exp})) "." base64url(HMAC_SHA256(secret, payload))

function b64urlToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(b: ArrayBuffer): string {
  let s = '';
  const v = new Uint8Array(b);
  for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Length-independent compare. Signatures are fixed-length here; do not rely on it. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface Ticket { sid: string; uid: string; exp: number }

export async function verifyTicket(token: string, secret: string): Promise<Ticket | null> {
  if (!secret || !token || !token.includes('.')) return null;
  const cut = token.lastIndexOf('.');
  const payloadB64 = token.slice(0, cut);
  const sig = token.slice(cut + 1);

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  if (!timingSafeEqual(bytesToB64url(mac), sig)) return null;

  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    if (!data?.sid || !data?.uid) return null;
    if (Number(data.exp ?? 0) < Date.now() / 1000) return null;
    return data as Ticket;
  } catch {
    return null;
  }
}

export function originAllowed(origin: string | null, allowed: string): boolean {
  if (!origin) return true;                       // non-browser clients omit it
  const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

// --- cost meter -------------------------------------------------------------
// Port of apps/ai-service/src/core/meter.py. Gemini reports what it billed;
// usageMetadata is cumulative for the session, so counts are absorbed with max()
// rather than summed — summing bills a call once per message that mentions it.

const RATE = { audioIn: 3.0, audioOut: 12.0, textIn: 0.75, textOut: 4.5 };  // USD / 1M tokens
const USD_TO_INR = 100;

export class CallMeter {
  audioIn = 0; audioOut = 0; textIn = 0; textOut = 0; seen = false;

  note(usage: any): void {
    if (!usage || typeof usage !== 'object') return;
    this.seen = true;
    const byModality = (details: any): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const d of Array.isArray(details) ? details : []) {
        const m = String(d?.modality ?? '').toUpperCase();
        const n = Number(d?.tokenCount ?? 0);
        if (m && Number.isFinite(n)) out[m] = (out[m] ?? 0) + n;
      }
      return out;
    };
    const p = byModality(usage.promptTokensDetails);
    const r = byModality(usage.responseTokensDetails);
    this.audioIn = Math.max(this.audioIn, p.AUDIO ?? 0);
    this.textIn = Math.max(this.textIn, p.TEXT ?? 0);
    this.audioOut = Math.max(this.audioOut, r.AUDIO ?? 0);
    this.textOut = Math.max(this.textOut, r.TEXT ?? 0);

    // Totals-only responses: book the remainder as audio. It is the dominant and
    // the expensive modality here, so this errs upward, never down.
    if (!Object.keys(p).length && !Object.keys(r).length) {
      this.audioIn = Math.max(this.audioIn, Number(usage.promptTokenCount ?? 0));
      this.audioOut = Math.max(this.audioOut, Number(usage.responseTokenCount ?? 0));
    }
  }

  breakdown() {
    const inr = (tok: number, rate: number) => (tok / 1e6) * rate * USD_TO_INR;
    const audio_in_inr = inr(this.audioIn, RATE.audioIn);
    const audio_out_inr = inr(this.audioOut, RATE.audioOut);
    const text_in_inr = inr(this.textIn, RATE.textIn);
    const text_out_inr = inr(this.textOut, RATE.textOut);
    const total = audio_in_inr + audio_out_inr + text_in_inr + text_out_inr;
    return {
      audio_in_inr: +audio_in_inr.toFixed(4),
      audio_out_inr: +audio_out_inr.toFixed(4),
      text_in_inr: +text_in_inr.toFixed(4),
      text_out_inr: +text_out_inr.toFixed(4),
      total_inr: +total.toFixed(4),
      total_paise: Math.round(total * 100),
      audio_in_tokens: this.audioIn,
      audio_out_tokens: this.audioOut,
      measured: this.seen,
      // No egress line: on Workers there is no per-GB charge. That absence is
      // the entire reason these relays moved here.
    };
  }
}

/** POST to the API gateway with the internal key. Never throws. */
export function gatewayPost(env: Env, path: string, body: unknown): Promise<unknown> {
  return fetch(`${env.API_GATEWAY_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': env.INTERNAL_API_KEY },
    body: JSON.stringify(body),
  }).catch((e) => console.warn('gateway post failed', path, String(e)));
}

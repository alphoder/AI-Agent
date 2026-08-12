/**
 * The live-session audio relay, on Cloudflare Workers.
 *
 * A faithful port of apps/ai-service/src/routes/session.py. It exists for one
 * reason: the Python relay runs in Render's Oregon region, which puts ~415ms of
 * round trip into every audio frame for Indian users, and bills every forwarded
 * byte as egress. A Worker runs at the edge nearest the caller (Mumbai, for us)
 * and Cloudflare charges nothing for bandwidth.
 *
 * What is deliberately NOT here — see README.md:
 *   - body-language video frames (camera is off by default; stays on Python)
 *   - native-audio language routing (still the flash-live model for everyone)
 *   - the one-socket-per-session guard, which needs a Durable Object
 *
 * Everything else is parity: ticket auth, origin check, the Gemini setup
 * handshake, transcript persistence, end_call, the duration caps, and the cost
 * meter that reads Gemini's own usageMetadata.
 */

export interface Env {
  GEMINI_API_KEY: string;
  WS_TICKET_SECRET: string;
  INTERNAL_API_KEY: string;
  API_GATEWAY_URL: string;
  CORS_ORIGINS: string;
  GEMINI_LIVE_MODEL?: string;
}

// --- must match packages/shared/src/voices.ts -------------------------------
const LIVE_VOICES = new Set([
  'Charon', 'Orus', 'Puck', 'Fenrir', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Algenib', 'Rasalgethi', 'Alnilam', 'Schedar', 'Achird', 'Zubenelgenubi', 'Sadachbia',
  'Sadaltager', 'Kore', 'Aoede', 'Leda', 'Zephyr', 'Callirrhoe', 'Autonoe', 'Despina',
  'Erinome', 'Laomedeia', 'Achernar', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat',
]);
const DEFAULT_VOICE = 'Charon';
const DEFAULT_MODEL = 'models/gemini-3.1-flash-live-preview';

const MAX_MESSAGE_BYTES = 2_000_000;
const MAX_MESSAGES_PER_SEC = 60;
const MAX_SESSION_SECONDS = 1800;
const MAX_CALL_SECONDS = 300;
const CALL_CAP_GRACE = 20;

/** Lets the customer hang up — a real consequence, handled here not in the browser. */
const END_CALL_TOOL = {
  function_declarations: [{
    name: 'end_call',
    description:
      'Hang up / end the phone call. Call this when you (the customer) have run out of patience ' +
      '(the agent gave no reason to stay, was too pushy, or you are genuinely busy), or when the ' +
      'conversation has naturally reached its end.',
    parameters: {
      type: 'OBJECT',
      properties: {
        reason: {
          type: 'STRING',
          description: "short reason, e.g. 'no reason to stay', 'too pushy', 'genuinely busy'",
        },
      },
    },
  }],
};

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

/** Length-independent compare. Signatures are fixed-length here, but do not rely on that. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Ticket { sid: string; uid: string; exp: number }

async function verifyTicket(token: string, secret: string): Promise<Ticket | null> {
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

function originAllowed(origin: string | null, allowed: string): boolean {
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

class CallMeter {
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
      // the entire reason this file exists.
    };
  }
}

// --- the relay --------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok');
    if (url.pathname !== '/ws/session') return new Response('not found', { status: 404 });
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    // Authenticate BEFORE accepting. Ticket is primary; origin is defence in
    // depth against cross-site WebSocket hijacking.
    const ticket = await verifyTicket(url.searchParams.get('ticket') ?? '', env.WS_TICKET_SECRET);
    if (!ticket) return new Response('unauthorized', { status: 401 });
    if (!originAllowed(request.headers.get('Origin'), env.CORS_ORIGINS)) {
      return new Response('forbidden origin', { status: 403 });
    }

    const rawLang = url.searchParams.get('lang') ?? 'en';
    const lang = (rawLang.match(/[a-zA-Z-]/g) ?? []).join('').toLowerCase().slice(0, 8) || 'en';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    // Everything below runs after the 101 goes back, so the browser is not kept
    // waiting on Gemini's handshake.
    ctx.waitUntil(pump(server, env, ticket, lang, ctx));

    return new Response(null, { status: 101, webSocket: client });
  },
};

async function pump(browser: WebSocket, env: Env, ticket: Ticket, lang: string, ctx: ExecutionContext): Promise<void> {
  const sessionId = ticket.sid;
  const meter = new CallMeter();
  const startedAt = Date.now();

  let gemini: WebSocket | null = null;
  let micActive = true;
  let openerDone = false;
  let spokeAt: number | null = null;         // the customer's first word starts the call clock
  let turn = 0;
  let userTranscript = '';
  let coachTranscript = '';
  let userFinalSent = false;
  let rateWindow = 0;
  let rateCount = 0;
  let closed = false;

  const send = (o: unknown) => { try { browser.send(JSON.stringify(o)); } catch { /* gone */ } };

  const api = (path: string, body: unknown) =>
    fetch(`${env.API_GATEWAY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': env.INTERNAL_API_KEY },
      body: JSON.stringify(body),
    }).catch((e) => console.warn('persist failed', String(e)));

  /**
   * Fire and forget, deliberately. The transcript goes edge -> gateway (Oregon)
   * -> Neon (us-east-1), which is ~1.6s from here. Awaiting it inside the turn
   * handler put that between turnComplete and response_end, and queued every
   * later Gemini message behind it — a database round trip in the middle of a
   * live conversation. waitUntil keeps the write alive past the handler without
   * anyone waiting on it.
   */
  const persistTurn = (learner: string, coach: string): void => {
    if (!learner && !coach) return;
    turn += 1;
    ctx.waitUntil(api('/api/internal/transcripts', {
      session_id: sessionId,
      turn_number: turn,
      learner_content: learner || null,
      coach_content: coach || null,
    }));
  };

  const shutdown = (code = 1000) => {
    if (closed) return;
    closed = true;
    console.log(JSON.stringify({ event: 'call.cost', relay: 'worker', session_id: sessionId, ...meter.breakdown() }));
    try { gemini?.close(); } catch { /* already gone */ }
    try { browser.close(code); } catch { /* already gone */ }
  };

  // --- wait for the browser's config frame, then open Gemini ----------------
  const config: any = await new Promise((resolve) => {
    const onFirst = (e: MessageEvent) => {
      browser.removeEventListener('message', onFirst as EventListener);
      try {
        const raw = typeof e.data === 'string' ? e.data : '';
        if (raw.length > MAX_MESSAGE_BYTES) return resolve(null);
        resolve(JSON.parse(raw));
      } catch { resolve(null); }
    };
    browser.addEventListener('message', onFirst as EventListener);
    browser.addEventListener('close', () => resolve(null));
  });

  if (!config || config.type !== 'config') { shutdown(1008); return; }

  const systemPrompt = typeof config.system_prompt === 'string'
    ? config.system_prompt.slice(0, 8000)
    : 'You are a friendly conversation partner. Keep replies to 1-2 sentences.';
  const voice = LIVE_VOICES.has(config.voice) ? config.voice : DEFAULT_VOICE;

  const model = env.GEMINI_LIVE_MODEL || DEFAULT_MODEL;
  const geminiUrl =
    'https://generativelanguage.googleapis.com/ws/' +
    'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent' +
    `?key=${env.GEMINI_API_KEY}`;

  const upstream = await fetch(geminiUrl, { headers: { Upgrade: 'websocket' } });
  gemini = upstream.webSocket;
  if (!gemini) { send({ type: 'error', message: 'upstream unavailable' }); shutdown(1011); return; }
  gemini.accept();

  const speechConfig: any = { voice_config: { prebuilt_voice_config: { voice_name: voice } } };
  if (lang.includes('-')) speechConfig.language_code = lang;   // already normalised by the caller

  gemini.send(JSON.stringify({
    setup: {
      model,
      generation_config: { response_modalities: ['AUDIO'], speech_config: speechConfig },
      system_instruction: { parts: [{ text: systemPrompt }] },
      input_audio_transcription: {},
      output_audio_transcription: {},
      tools: [END_CALL_TOOL],
    },
  }));

  // --- Gemini -> browser ----------------------------------------------------
  gemini.addEventListener('message', async (e: MessageEvent) => {
    let data: any;
    try { data = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer)); }
    catch { return; }

    meter.note(data.usageMetadata);

    const toolCall = data.toolCall;
    if (toolCall?.functionCalls?.length) {
      for (const call of toolCall.functionCalls) {
        if (call.name === 'end_call') {
          const reason = String(call.args?.reason ?? 'ended');
          persistTurn('', `[Customer ended the call: ${reason}]`);
          send({ type: 'call_ended', reason });
          shutdown();
          return;
        }
      }
      return;
    }

    const sc = data.serverContent;
    if (!sc) return;

    if (sc.inputTranscription?.text) {
      userTranscript += sc.inputTranscription.text;
      send({ type: 'transcript_interim', text: userTranscript });
    }
    if (sc.outputTranscription?.text) coachTranscript += sc.outputTranscription.text;

    if (sc.modelTurn) {
      if (userTranscript && !userFinalSent) {
        send({ type: 'transcript', text: userTranscript, role: 'user' });
        userFinalSent = true;
      }
      for (const part of sc.modelTurn.parts ?? []) {
        const inline = part.inlineData ?? part.inline_data;
        if (inline?.data) {
          if (spokeAt === null) spokeAt = Date.now();     // the call clock starts here
          send({ type: 'audio_out', data: inline.data });
        }
      }
    }

    if (sc.turnComplete) {
      if (!openerDone) { openerDone = true; send({ type: 'opener_done' }); }
      const learner = userTranscript.trim();
      const coach = coachTranscript.trim();
      if (coach) send({ type: 'response_text', text: coach, role: 'assistant' });
      persistTurn(learner, coach);
      userTranscript = ''; coachTranscript = ''; userFinalSent = false;
      send({ type: 'response_end' });
    }
  });

  gemini.addEventListener('close', () => shutdown());
  gemini.addEventListener('error', () => { send({ type: 'error', message: 'stream error' }); shutdown(1011); });

  // --- browser -> Gemini ----------------------------------------------------
  browser.addEventListener('message', (e: MessageEvent) => {
    if (closed) return;

    const now = Date.now();
    if (now - startedAt > MAX_SESSION_SECONDS * 1000) {
      send({ type: 'error', message: 'session time limit reached' }); shutdown(); return;
    }
    // Backstop only: the browser owns the visible clock, hence the grace period.
    if (spokeAt !== null && now - spokeAt > (MAX_CALL_SECONDS + CALL_CAP_GRACE) * 1000) {
      send({ type: 'call_ended', reason: 'time up' }); shutdown(); return;
    }

    const raw = typeof e.data === 'string' ? e.data : '';
    if (!raw || raw.length > MAX_MESSAGE_BYTES) return;

    if (now - rateWindow >= 1000) { rateWindow = now; rateCount = 0; }
    if (++rateCount > MAX_MESSAGES_PER_SEC) return;

    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'audio') {
      if (!micActive || !openerDone) return;
      if (typeof msg.data === 'string' && msg.data && gemini) {
        gemini.send(JSON.stringify({
          realtime_input: { audio: { mime_type: 'audio/pcm;rate=16000', data: msg.data } },
        }));
      }
    } else if (msg.type === 'text') {
      const t = String(msg.text ?? '').trim().slice(0, 2000);
      if (t && gemini) {
        gemini.send(JSON.stringify({
          client_content: { turns: [{ role: 'user', parts: [{ text: t }] }], turn_complete: true },
        }));
      }
    } else if (msg.type === 'mic_off') { micActive = false; }
    else if (msg.type === 'mic_on') { micActive = true; }
  });

  browser.addEventListener('close', () => shutdown());
  browser.addEventListener('error', () => shutdown(1011));
}

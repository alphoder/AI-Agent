/**
 * The practice-call relay — a port of apps/ai-service/src/routes/session.py.
 *
 * Deliberately not here, see README.md: body-language video frames, native-audio
 * language routing, and the one-socket-per-session guard (needs a Durable
 * Object). Everything else is parity.
 */
import { CallMeter, Env, GEMINI_WS, Ticket, gatewayPost } from './shared';

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

export async function sessionRelay(
  browser: WebSocket, env: Env, ticket: Ticket, lang: string, ctx: ExecutionContext,
): Promise<void> {
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

  /**
   * Fire and forget, deliberately. The transcript goes edge -> gateway (Oregon)
   * -> Neon (us-east-1), which is ~1.6s from India. Awaiting it inside the turn
   * handler put that between turnComplete and response_end, and queued every
   * later Gemini frame behind it — a database round trip in the middle of a live
   * conversation. waitUntil keeps the write alive without anyone waiting on it.
   */
  const persistTurn = (learner: string, coach: string): void => {
    if (!learner && !coach) return;
    turn += 1;
    ctx.waitUntil(gatewayPost(env, '/api/internal/transcripts', {
      session_id: sessionId,
      turn_number: turn,
      learner_content: learner || null,
      coach_content: coach || null,
    }));
  };

  const shutdown = (code = 1000) => {
    if (closed) return;
    closed = true;
    console.log(JSON.stringify({ event: 'call.cost', relay: 'session', session_id: sessionId, ...meter.breakdown() }));
    try { gemini?.close(); } catch { /* already gone */ }
    try { browser.close(code); } catch { /* already gone */ }
  };

  // --- config frame, then open Gemini ---------------------------------------
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

  const upstream = await fetch(`${GEMINI_WS}?key=${env.GEMINI_API_KEY}`, {
    headers: { Upgrade: 'websocket' },
  });
  gemini = upstream.webSocket;
  if (!gemini) { send({ type: 'error', message: 'upstream unavailable' }); shutdown(1011); return; }
  gemini.accept();

  const speechConfig: any = { voice_config: { prebuilt_voice_config: { voice_name: voice } } };
  if (lang.includes('-')) speechConfig.language_code = lang;   // normalised by the caller

  gemini.send(JSON.stringify({
    setup: {
      model: env.GEMINI_LIVE_MODEL || DEFAULT_MODEL,
      generation_config: { response_modalities: ['AUDIO'], speech_config: speechConfig },
      system_instruction: { parts: [{ text: systemPrompt }] },
      input_audio_transcription: {},
      output_audio_transcription: {},
      tools: [END_CALL_TOOL],
    },
  }));

  // --- Gemini -> browser ----------------------------------------------------
  gemini.addEventListener('message', (e: MessageEvent) => {
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
      const coach = coachTranscript.trim();
      if (coach) send({ type: 'response_text', text: coach, role: 'assistant' });
      persistTurn(userTranscript.trim(), coach);
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
    if (!msg || typeof msg !== 'object' || !gemini) return;

    if (msg.type === 'audio') {
      if (!micActive || !openerDone) return;
      if (typeof msg.data === 'string' && msg.data) {
        gemini.send(JSON.stringify({
          realtime_input: { audio: { mime_type: 'audio/pcm;rate=16000', data: msg.data } },
        }));
      }
    } else if (msg.type === 'text') {
      const t = String(msg.text ?? '').trim().slice(0, 2000);
      if (t) {
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

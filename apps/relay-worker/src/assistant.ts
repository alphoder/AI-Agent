/**
 * Bixy's relay — a port of apps/ai-service/src/routes/assistant.py.
 *
 * Differs from the practice-call relay in three ways worth knowing:
 *   - it runs on Gemini key 2, so a busy site assistant cannot starve practice
 *     calls of quota, and vice versa;
 *   - the tools live in the browser (navigate, list scenarios, start practice),
 *     so tool calls are forwarded out and their answers forwarded back. Two
 *     exceptions are answered here: recall_memory, which reads the user's 24-hour
 *     memory from the gateway, and go_sleep, which tells the page to mute her;
 *   - Bixy has a 30-minute socket, not a 5-minute call.
 */
import { CallMeter, Env, GEMINI_WS, Ticket, gatewayPost } from './shared';

// Native-audio voices. Leda is youthful — closest to a child-like voice for Bixy.
const LIVE_VOICES = new Set([
  'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr', 'Autonoe', 'Sulafat',
]);
const DEFAULT_VOICE = 'Leda';
const DEFAULT_MODEL = 'models/gemini-3.1-flash-live-preview';

const MAX_MESSAGE_BYTES = 2_000_000;
const MAX_MESSAGES_PER_SEC = 60;
const MAX_SECONDS = 1800;

/** Answered by the relay, never forwarded to the browser. */
const SERVER_TOOLS = [{
  function_declarations: [
    {
      name: 'recall_memory',
      description:
        'Recall what you and the user talked about earlier today (up to 24 hours back). Use this ' +
        "whenever the user refers to an earlier conversation, asks 'do you remember…', or asks you " +
        'to remember something from before. Returns short conversation snippets from your ' +
        'short-term memory.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: {
            type: 'STRING',
            description: "optional topic or keywords, e.g. 'cold call', 'nerves', 'interview'",
          },
        },
      },
    },
    {
      name: 'go_sleep',
      description:
        'Go quiet / stop talking for a while. Call this when the user asks you to be quiet, stay ' +
        'silent, stop talking, go to sleep, or take a nap. The site mutes the mic and hides you ' +
        'until the time is up.',
      parameters: {
        type: 'OBJECT',
        properties: {
          minutes: {
            type: 'NUMBER',
            description: "how many minutes to stay quiet. Omit (defaults to 30) if no time is given.",
          },
        },
      },
    },
  ],
}];

export async function assistantRelay(
  browser: WebSocket, env: Env, ticket: Ticket, ctx: ExecutionContext,
): Promise<void> {
  const sid = ticket.sid;
  const uid = ticket.uid ?? '';
  const meter = new CallMeter();
  const startedAt = Date.now();

  let gemini: WebSocket | null = null;
  let micActive = true;
  let userTranscript = '';
  let coachTranscript = '';
  let userFinalSent = false;
  let rateWindow = 0;
  let rateCount = 0;
  let closed = false;

  const send = (o: unknown) => { try { browser.send(JSON.stringify(o)); } catch { /* gone */ } };

  const shutdown = (code = 1000) => {
    if (closed) return;
    closed = true;
    console.log(JSON.stringify({ event: 'call.cost', relay: 'assistant', sid, uid, ...meter.breakdown() }));
    try { gemini?.close(); } catch { /* already gone */ }
    try { browser.close(code); } catch { /* already gone */ }
  };

  /** The user's 24-hour memory, newest-first from the gateway, returned chronologically. */
  const recallMemory = async (query: unknown): Promise<unknown[]> => {
    if (!uid) return [];
    try {
      const params = new URLSearchParams({ user_id: uid, limit: '40' });
      if (typeof query === 'string' && query) params.set('q', query.slice(0, 120));
      const r = await fetch(`${env.API_GATEWAY_URL}/api/internal/assistant/memory?${params}`, {
        headers: { 'X-Internal-Key': env.INTERNAL_API_KEY },
      });
      if (!r.ok) return [];
      const data = (await r.json() as any)?.data ?? [];
      return Array.isArray(data) ? data.reverse() : [];
    } catch (e) {
      console.warn('recall failed', String(e));
      return [];
    }
  };

  /** Append a finished turn to the 24-hour memory. Fire and forget — see session.ts. */
  const remember = (learner: string, coach: string): void => {
    if (!uid) return;
    const entries = [];
    if (learner) entries.push({ role: 'user', text: learner });
    if (coach) entries.push({ role: 'assistant', text: coach });
    if (!entries.length) return;
    ctx.waitUntil(gatewayPost(env, '/api/internal/assistant/memory', { user_id: uid, entries }));
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
  if (!env.GEMINI_PROMPT_API_KEY) {
    send({ type: 'error', message: 'assistant is not configured' });
    shutdown(1011);
    return;
  }

  const systemPrompt = typeof config.system_prompt === 'string'
    ? config.system_prompt.slice(0, 8000)
    : 'You are a helpful voice assistant for this website.';
  const voice = LIVE_VOICES.has(config.voice) ? config.voice : DEFAULT_VOICE;
  const browserTools = Array.isArray(config.tools) ? config.tools : [];

  const upstream = await fetch(`${GEMINI_WS}?key=${env.GEMINI_PROMPT_API_KEY}`, {
    headers: { Upgrade: 'websocket' },
  });
  gemini = upstream.webSocket;
  if (!gemini) { send({ type: 'error', message: 'upstream unavailable' }); shutdown(1011); return; }
  gemini.accept();

  gemini.send(JSON.stringify({
    setup: {
      model: env.GEMINI_ASSISTANT_MODEL || DEFAULT_MODEL,
      generation_config: {
        response_modalities: ['AUDIO'],
        speech_config: { voice_config: { prebuilt_voice_config: { voice_name: voice } } },
      },
      system_instruction: { parts: [{ text: systemPrompt }] },
      input_audio_transcription: {},
      output_audio_transcription: {},
      tools: [...browserTools, ...SERVER_TOOLS],
    },
  }));

  // --- Gemini -> browser ----------------------------------------------------
  gemini.addEventListener('message', async (e: MessageEvent) => {
    let data: any;
    try { data = JSON.parse(typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data as ArrayBuffer)); }
    catch { return; }

    meter.note(data.usageMetadata);

    if ('setupComplete' in data) { send({ type: 'listening' }); return; }

    const toolCall = data.toolCall;
    if (toolCall?.functionCalls?.length) {
      const serverResponses: unknown[] = [];
      const browserCalls: unknown[] = [];
      for (const call of toolCall.functionCalls) {
        if (call.name === 'recall_memory') {
          const snippets = await recallMemory(call.args?.query);
          serverResponses.push({ id: call.id, name: call.name, response: { snippets } });
        } else if (call.name === 'go_sleep') {
          let minutes = Number(call.args?.minutes);
          if (!Number.isFinite(minutes) || minutes < 1) minutes = 30;
          minutes = Math.min(minutes, 720);
          send({ type: 'sleep', minutes });
          serverResponses.push({ id: call.id, name: call.name, response: { ok: true, minutes } });
        } else {
          browserCalls.push(call);
        }
      }
      if (serverResponses.length && gemini) {
        gemini.send(JSON.stringify({ tool_response: { function_responses: serverResponses } }));
      }
      if (browserCalls.length) send({ type: 'tool_call', calls: browserCalls });
      return;
    }

    const sc = data.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      // The user spoke over Bixy — Gemini cut the reply off. Drop the partial
      // coach text (it was never her line) and tell the page to flush queued
      // audio now, or the stale reply plays on behind the new one.
      coachTranscript = '';
      send({ type: 'interrupted' });
      return;
    }
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
        if (inline?.data) send({ type: 'audio_out', data: inline.data });
      }
    }

    if (sc.turnComplete) {
      const coach = coachTranscript.trim();
      if (coach) send({ type: 'response_text', text: coach, role: 'assistant' });
      remember(userTranscript.trim(), coach);
      userTranscript = ''; coachTranscript = ''; userFinalSent = false;
      send({ type: 'response_end' });
    }
  });

  gemini.addEventListener('close', () => shutdown());
  gemini.addEventListener('error', () => { send({ type: 'error', message: 'stream error' }); shutdown(1011); });

  // --- browser -> Gemini ----------------------------------------------------
  browser.addEventListener('message', (e: MessageEvent) => {
    if (closed) return;

    if (Date.now() - startedAt > MAX_SECONDS * 1000) {
      send({ type: 'error', message: 'assistant time limit reached' });
      shutdown();
      return;
    }

    const raw = typeof e.data === 'string' ? e.data : '';
    if (!raw || raw.length > MAX_MESSAGE_BYTES) return;

    const now = Date.now();
    if (now - rateWindow >= 1000) { rateWindow = now; rateCount = 0; }
    if (++rateCount > MAX_MESSAGES_PER_SEC) return;

    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object' || !gemini) return;

    if (msg.type === 'audio') {
      if (!micActive) return;
      if (typeof msg.data === 'string' && msg.data) {
        gemini.send(JSON.stringify({
          realtime_input: { audio: { mime_type: 'audio/pcm;rate=16000', data: msg.data } },
        }));
      }
    } else if (msg.type === 'text') {
      const t = String(msg.text ?? '').trim().slice(0, 2000);
      if (t) {
        send({ type: 'transcript', text: t, role: 'user' });
        gemini.send(JSON.stringify({
          client_content: { turns: [{ role: 'user', parts: [{ text: t }] }], turn_complete: true },
        }));
      }
    } else if (msg.type === 'tool_response') {
      // The browser executed its tools; hand the results back to Gemini.
      if (Array.isArray(msg.responses)) {
        gemini.send(JSON.stringify({ tool_response: { function_responses: msg.responses } }));
      }
    } else if (msg.type === 'mic_off') { micActive = false; }
    else if (msg.type === 'mic_on') { micActive = true; }
  });

  browser.addEventListener('close', () => shutdown());
  browser.addEventListener('error', () => shutdown(1011));
}

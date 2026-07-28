'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { floatTo16BitPCM, arrayBufferToBase64 } from '@/lib/audio';
import { LANGUAGES, languageName, VOICE_IDS, MALE_VOICES, FEMALE_VOICES } from '@avatar-platform/shared';
import { useAuth } from '@/hooks/use-auth';
import { AssistantOrb, OrbState } from './assistant-orb';

interface Entry { role: 'user' | 'assistant'; text: string }

const BIXY_VOICE = 'Leda';
const WAKE = /\bbix(y|ie|i|ee)\b/i; // "hey bixy", "bixy", ...
const IDLE_MS = 45000;             // close the session only after this much true silence

const HINTS = [
  'Say “Hey Bixy” to wake me',
  '“Hey Bixy, show my scenarios”',
  '“Hey Bixy, start a term-life cold call”',
  '“Hey Bixy, open my reports”',
];

function systemPrompt(name: string, isAdmin: boolean) {
  const base = `You are Bixy — a cheerful, upbeat voice helper for SpeakCoach, a sales and client-conversation training app (insurance/BFSI plus client-growth skills). The trainee practises by talking to AI "customers" and client stakeholders.
The user's name is ${name}. Greet them warmly by name, then help. Speak in short, warm sentences.

You can CALL tools to: search/list scenarios, start a practice call, show history, and navigate anywhere (Practice/scenarios, Reports, Analytics, Teams, Community, Live Room, Settings, Help).`;

  const build = `

BUILD A SCENARIO (whenever the user wants custom/specific practice, or says "help me build a scenario"):
Ask EXACTLY these FIVE questions, ONE AT A TIME, waiting for each answer before the next. Keep each question to one short, natural sentence — this should feel like a quick chat, not a form:
  1) What do you want to practise? (the situation — e.g. a term-life cold call, a price objection, winning over a sceptical CFO)
  2) Who is on the other end — their role, and do they already know you or is this cold?
  3) What makes them hard — their main pushback, objection, or mood?
  4) What would make this call a win for you?
  5) Which language should they speak, and how tough — beginner, intermediate, or advanced?
NEVER ask two at once and never skip ahead. If the user already told you something (e.g. they said "an angry renewal customer in Hindi"), do NOT re-ask it — acknowledge it and move to the next unanswered question. If they say "just build it" or seem impatient, sensibly fill the rest yourself and go.

Then CALL create_scenario. Write character_prompt as a REAL PERSON, never a list of objections:
  - a name, age, job and life/business situation
  - their personality and how they actually talk
  - their real concern in their own words, plus the relationship (cold stranger / existing customer / senior client)
  - a HIDDEN need, fear or motive they will NOT volunteer until the trainee earns it
  - do NOT script outcomes like "if the agent says X, they agree" — the app judges the trainee's reasoning itself
Match difficulty to their answer to Q5. create_scenario SHOWS the finished scenario as a card on screen — it does NOT start the call. Once it is built, tell them it is ready and that they can hit Start when they want. NEVER claim the call is starting, and never start it yourself.`;

  const recommend = `

RECOMMEND A SCENARIO (whenever the user wants practice, or is unsure where to start):
Ask at most TWO quick questions, one at a time: (1) what do you want to practise or get better at, and (2) how tough — beginner, intermediate, or advanced? Then CALL list_scenarios with a relevant query, pick the 1-2 best fits from the results, say in one short sentence why each fits, and offer to start one. When they choose, CALL start_practice.
You CANNOT create new scenarios — only an admin can add to the library. If the user asks for something custom, do not apologise at length: find the CLOSEST existing scenario and pitch it ("the closest we have is the angry motor-renewal customer — want to try that?"). If nothing fits at all, tell them their admin can add it.`;

  const close = `

Always CALL tools to actually do things; never just describe. Ignore any wake phrase like "hey bixy" and act on the rest.`;

  return base + (isAdmin ? build : recommend) + close;
}

const TOOLS = [
  {
    function_declarations: [
      { name: 'navigate', description: 'Navigate the user to a page on the site.',
        parameters: { type: 'OBJECT', properties: { page: { type: 'STRING', enum: ['journey', 'scenarios', 'live', 'completed', 'reports', 'analytics', 'teams', 'competition', 'wallet', 'settings', 'profile', 'create_scenario'], description: 'Which page: journey (My Journey), scenarios, live (Live Room), completed, reports, analytics, teams, competition, wallet (Balance), settings, profile, create_scenario' } }, required: ['page'] } },
      { name: 'list_scenarios', description: 'List or search the available practice scenarios.',
        parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'optional search text' } } } },
      { name: 'start_practice', description: 'Start a practice session for a scenario the user names, optionally in a chosen language.',
        parameters: { type: 'OBJECT', properties: { scenario: { type: 'STRING', description: 'name or topic' }, language: { type: 'STRING', description: 'ISO code e.g. en, hi, es' } }, required: ['scenario'] } },
      { name: 'create_scenario', description: 'Design a custom practice scenario and show it to the user as a card. Does NOT start the call — the user starts it. Call this only after the five questions are answered (or the user asks you to just build it).',
        parameters: { type: 'OBJECT', properties: {
          title: { type: 'STRING', description: 'short title, e.g. "Angry motor-renewal customer"' },
          description: { type: 'STRING', description: 'one line describing the situation' },
          objective: { type: 'STRING', description: 'what a win looks like for the trainee on this call (from question 4)' },
          character_prompt: { type: 'STRING', description: 'The person, written as a REAL HUMAN: name, age, job and life/business situation; personality and how they talk; their real concern in their own words; the relationship (cold stranger / existing customer / senior client); and a HIDDEN need or fear they will NOT volunteer until it is earned. Do NOT script outcomes ("if the agent says X they agree") — the app judges the trainee itself.' },
          language: { type: 'STRING', description: 'e.g. en, hi, ta, mr, te' },
          difficulty: { type: 'STRING', enum: ['beginner', 'intermediate', 'advanced'], description: 'from question 5 — drives how strictly the character judges the trainee' },
          voice: { type: 'STRING', enum: VOICE_IDS, description: `customer voice — male: ${MALE_VOICES.slice(0, 6).map((v) => v.id).join('/')}…; female: ${FEMALE_VOICES.slice(0, 6).map((v) => v.id).join('/')}…` },
        }, required: ['title', 'character_prompt'] } },
      { name: 'view_history', description: "Open the user's past practice sessions and scores.", parameters: { type: 'OBJECT', properties: {} } },
    ],
  },
];

/** Non-admins get the library, not the workshop — create_scenario is admin-only. */
function toolsFor(isAdmin: boolean) {
  return [{ function_declarations: TOOLS[0].function_declarations.filter((d) => isAdmin || d.name !== 'create_scenario') }];
}

function resolveLang(input?: string): string | undefined {
  if (!input) return undefined;
  const t = input.trim().toLowerCase();
  const byCode = LANGUAGES.find((l) => l.code === t);
  if (byCode) return byCode.code;
  return LANGUAGES.find((l) => l.name.toLowerCase().includes(t))?.code;
}

export function AssistantWidget() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const nameRef = useRef('there');
  const adminRef = useRef(false);
  useEffect(() => {
    nameRef.current = (user?.name || user?.email?.split('@')[0] || 'there').split(' ')[0];
    adminRef.current = (user?.metadata as { role?: string } | null)?.role === 'admin';
  }, [user]);

  const [ready, setReady] = useState(false);   // Gemini session live
  const [awake, setAwake] = useState(false);     // in a conversation
  const [speaking, setSpeaking] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [last, setLast] = useState<Entry | null>(null); // latest line, for the inline caption
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(0);
  // A scenario Bixy just built — shown as a card; the user starts it.
  const [built, setBuilt] = useState<{ id: string; title: string; description: string; objective: string; difficulty: string; language: string; voice: string } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inCtxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const playCursorRef = useRef(0);
  const awakeRef = useRef(false);
  const recRef = useRef<any>(null);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectingRef = useRef(false);
  const pendingRef = useRef<string[]>([]);
  const connectRef = useRef<() => void>(() => {});

  const orbState: OrbState = !awake ? 'asleep' : !ready ? 'loading' : speaking ? 'speaking' : 'listening';

  // Rotate idle hints only while asleep.
  useEffect(() => {
    if (awake) return;
    const t = setInterval(() => setHint((h) => (h + 1) % HINTS.length), 4200);
    return () => clearInterval(t);
  }, [awake]);

  const playAudio = useCallback((b64: string) => {
    const ctx = outCtxRef.current;
    if (!ctx) return;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000;
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const at = Math.max(ctx.currentTime, playCursorRef.current);
    src.start(at);
    playCursorRef.current = at + buf.duration;
    setSpeaking(true);
    if (speakTimerRef.current) clearTimeout(speakTimerRef.current);
    speakTimerRef.current = setTimeout(() => setSpeaking(false), (playCursorRef.current - ctx.currentTime) * 1000 + 200);
  }, []);

  // Stream raw mic audio straight to Gemini — browser-agnostic, works wherever the
  // mic does (unlike the Web Speech API, which Brave/Firefox block). Gemini does
  // the transcription and replies in voice.
  const stopMic = useCallback(() => {
    try { procRef.current?.disconnect(); } catch { /* ignore */ }
    procRef.current = null;
    try { inCtxRef.current?.close(); } catch { /* ignore */ }
    inCtxRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  }, []);

  const startMic = useCallback(async (ws: WebSocket) => {
    if (inCtxRef.current) return; // already streaming
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!awakeRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      micStreamRef.current = stream;
      const inCtx = new AudioContext({ sampleRate: 16000 });
      inCtxRef.current = inCtx;
      const source = inCtx.createMediaStreamSource(stream);
      const proc = inCtx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      source.connect(proc);
      proc.connect(inCtx.destination);
      proc.onaudioprocess = (e) => {
        if (!awakeRef.current || ws.readyState !== WebSocket.OPEN) return;
        const pcm = floatTo16BitPCM(e.inputBuffer.getChannelData(0));
        ws.send(JSON.stringify({ type: 'audio', data: arrayBufferToBase64(pcm) }));
      };
    } catch {
      setError('I need mic access to hear you.');
    }
  }, []);

  // Tear down the Gemini session and go quiet (only after real silence, or manual stop).
  const goToSleep = useCallback(() => {
    awakeRef.current = false;
    setAwake(false);
    setReady(false);
    setSpeaking(false);
    pendingRef.current = [];
    stopMic();
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    try { wsRef.current?.close(1000); } catch { /* ignore */ }
    wsRef.current = null;
  }, [stopMic]);

  // Keep-alive: any speech (or Bixy talking) pushes the silence deadline out.
  const bumpIdle = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => goToSleep(), IDLE_MS);
  }, [goToSleep]);

  const executeTool = useCallback(async (name: string, args: Record<string, unknown>) => {
    try {
      if (name === 'navigate') {
        const map: Record<string, string> = { journey: '/journey', scenarios: '/scenarios', live: '/live', completed: '/completed', reports: '/reports', analytics: '/analytics', teams: '/teams', competition: '/competition', wallet: '/wallet', settings: '/settings', profile: '/profile', create_scenario: '/scenarios/create' };
        const path = map[String(args.page)] || '/scenarios';
        router.push(path); return { ok: true, navigated_to: path };
      }
      if (name === 'list_scenarios') {
        const q = args.query ? `?q=${encodeURIComponent(String(args.query))}` : '';
        const { data } = await apiClient.get(`/scenarios${q}`);
        const list = data.data.slice(0, 10).map((s: { id: string; title: string; language: string; difficulty_level: string }) => ({ id: s.id, title: s.title, language: s.language, difficulty: s.difficulty_level }));
        return { scenarios: list };
      }
      if (name === 'start_practice') {
        const { data } = await apiClient.get(`/scenarios?q=${encodeURIComponent(String(args.scenario))}`);
        const match = data.data[0];
        if (!match) return { error: `No scenario found matching "${args.scenario}". Offer to create one.` };
        const lang = resolveLang(args.language as string) || match.language || 'en';
        router.push(`/session/${match.id}?lang=${lang}`); return { ok: true, started: match.title, language: lang };
      }
      if (name === 'create_scenario') {
        if (!adminRef.current) {
          return { error: 'Only admins can create scenarios. Use list_scenarios to find and suggest the closest existing one instead.' };
        }
        const lang = resolveLang(args.language as string) || 'en';
        const voice = VOICE_IDS.includes(String(args.voice)) ? String(args.voice) : 'Charon';
        const payload = {
          title: String(args.title), description: args.description ? String(args.description) : '',
          objective: args.objective ? String(args.objective) : `Practise: ${args.title}`,
          system_prompt: String(args.character_prompt), opening_message: '',
          language: lang, voice,
          difficulty_level: ['beginner', 'intermediate', 'advanced'].includes(String(args.difficulty)) ? String(args.difficulty) : 'intermediate',
          // Empty rubric → the AI service scores against its insurance BEGINNER/
          // INTERMEDIATE/ADVANCED default for the chosen difficulty.
          visibility: 'private', tags: ['custom'], scoring_rubric: [],
        };
        const { data } = await apiClient.post('/scenarios', payload);
        // Build it, then SHOW it — the user decides when to start the call.
        setBuilt({ id: data.data.id, title: payload.title, description: payload.description,
          objective: payload.objective, difficulty: payload.difficulty_level, language: lang, voice });
        return { ok: true, created: payload.title, note: 'Scenario card is now on screen. Tell the user it is ready and that they can start it whenever they like. Do NOT start it yourself.' };
      }
      if (name === 'view_history') {
        router.push('/reports');
        const { data } = await apiClient.get('/sessions');
        return { sessions: data.data.slice(0, 8).map((s: { scenario_title: string; overall_score: number | null }) => ({ scenario: s.scenario_title, score: s.overall_score })) };
      }
      return { error: `Unknown tool ${name}` };
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      return { error: m || 'tool failed' };
    }
  }, [router]);

  // Send a recognised utterance to Gemini (local Web Speech does STT; Bixy replies in voice).
  const sendToGemini = useCallback((text: string) => {
    if (!text.trim()) return;
    outCtxRef.current?.resume().catch(() => {});
    setLast({ role: 'user', text });
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'text', text }));
    } else {
      pendingRef.current.push(text);
      connectRef.current();
    }
  }, []);

  const wake = useCallback(() => {
    if (!awakeRef.current) {
      awakeRef.current = true;
      setAwake(true);
      setError(null);
      outCtxRef.current?.resume().catch(() => {});
      connectRef.current();
    }
    bumpIdle();
  }, [bumpIdle]);

  // Web Speech (Chrome only) is used just for hands-free "Hey Bixy" wake. Once
  // awake, the raw mic stream feeds Gemini directly, so we must NOT also send the
  // recognised text (that would double every utterance). We only send the wake
  // utterance itself, since the mic isn't streaming yet at that instant.
  const onHeard = useCallback((text: string) => {
    if (!awakeRef.current) {
      if (!WAKE.test(text)) return;     // not addressed → stay asleep
      wake();
      sendToGemini(text);               // carry the first request in the wake phrase
      return;
    }
    bumpIdle();                          // already streaming audio — just stay awake
  }, [wake, sendToGemini, bumpIdle]);

  const startRecognizer = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setUnsupported(true); return; }
    if (recRef.current) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;   // interim activity keeps Bixy awake mid-sentence
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1];
      if (!r) return;
      const text = (r[0].transcript || '').trim();
      if (awakeRef.current) bumpIdle();              // ANY speech (even mid-word) defers sleep
      if (!r.isFinal) {
        if (!awakeRef.current && WAKE.test(text)) wake(); // wake snappily on interim
        return;
      }
      onHeard(text);
    };
    rec.onerror = () => { /* keep going */ };
    rec.onend = () => { if (mountedRef.current) { try { rec.start(); } catch { /* already running */ } } };
    try { rec.start(); } catch { /* ignore */ }
    recRef.current = rec;
  }, [onHeard, wake, bumpIdle]);

  // Open the Gemini session lazily, on wake. One session at a time; queued lines flush
  // on `listening`; retry only while awake (idle timer guarantees no infinite spin).
  const connect = useCallback(() => {
    if (wsRef.current || connectingRef.current) return;
    connectingRef.current = true;
    apiClient
      .post('/assistant/session')
      .then(({ data }) => {
        if (!mountedRef.current || !awakeRef.current) { connectingRef.current = false; return; }
        outCtxRef.current = outCtxRef.current || new AudioContext({ sampleRate: 24000 });
        const ws = new WebSocket(data.data.wsUrl);
        wsRef.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: 'config', system_prompt: systemPrompt(nameRef.current, adminRef.current), voice: BIXY_VOICE, tools: toolsFor(adminRef.current) }));
        ws.onmessage = async (ev) => {
          const msg = JSON.parse(ev.data);
          switch (msg.type) {
            case 'listening': {
              connectingRef.current = false;
              setReady(true); setError(null); bumpIdle();
              startMic(ws); // stream mic straight to Gemini — no browser Speech API needed
              const queued = pendingRef.current; pendingRef.current = [];
              queued.forEach((text) => ws.send(JSON.stringify({ type: 'text', text })));
              break;
            }
            case 'transcript': if (msg.text) { setLast({ role: 'user', text: msg.text }); bumpIdle(); } break;
            case 'response_text': if (msg.text) { setLast({ role: 'assistant', text: msg.text }); bumpIdle(); } break;
            case 'audio_out': playAudio(msg.data); bumpIdle(); break;
            case 'tool_call': {
              const responses = [];
              for (const c of (msg.calls || [])) responses.push({ id: c.id, name: c.name, response: await executeTool(c.name, c.args || {}) });
              ws.send(JSON.stringify({ type: 'tool_response', responses }));
              bumpIdle();
              break;
            }
            case 'response_end': bumpIdle(); break;   // keep the chat open; don't hang up
            case 'error': setError(msg.message || 'Hmm, that glitched — keep talking.'); break;
          }
        };
        ws.onclose = () => {
          wsRef.current = null; connectingRef.current = false; setReady(false); setSpeaking(false);
          stopMic();
          // Reconnect only if the user is still in the conversation.
          if (mountedRef.current && awakeRef.current) {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            reconnectRef.current = setTimeout(() => connect(), 2000);
          }
        };
      })
      .catch(() => {
        connectingRef.current = false;
        if (!mountedRef.current || !awakeRef.current) return;
        // The API may be waking from a cold start — keep retrying quietly.
        setError('Waking Bixy…');
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => connectRef.current(), 3000);
      });
  }, [executeTool, playAudio, bumpIdle, startMic, stopMic]);
  connectRef.current = connect;

  function toggle() {
    if (awakeRef.current) goToSleep();
    else wake();
  }

  // "Build with Bixy" button (anywhere in the app) → wake Bixy and start the
  // scenario-building interview.
  useEffect(() => {
    const onBuild = () => {
      wake();
      sendToGemini(adminRef.current
        ? 'Help me build a custom practice scenario, then run it.'
        : 'Help me find the right scenario to practise.');
    };
    window.addEventListener('bixy:build', onBuild);
    return () => window.removeEventListener('bixy:build', onBuild);
  }, [wake, sendToGemini]);

  useEffect(() => {
    mountedRef.current = true;
    // Local wake-word recogniser runs at rest — NO Gemini session until "Hey Bixy".
    startRecognizer();
    const resume = () => outCtxRef.current?.resume().catch(() => {});
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      [reconnectRef, speakTimerRef, idleTimerRef].forEach((r) => r.current && clearTimeout(r.current));
      try { recRef.current?.stop(); } catch { /* ignore */ }
      try { wsRef.current?.close(); } catch { /* ignore */ }
      stopMic();
      outCtxRef.current?.close().catch(() => {});
    };
  }, [startRecognizer, stopMic]);

  // Inline caption (no panel) — speaks for itself right on the orb.
  let caption: string;
  if (unsupported && !awake) caption = 'Tap me to talk';
  else if (error) caption = error;
  else if (!awake) caption = HINTS[hint];
  else if (!ready) caption = 'Waking up…';
  else if (speaking) caption = last?.role === 'assistant' ? last.text : 'Mm-hmm…';
  else caption = last?.role === 'user' ? `“${last.text}”` : 'Listening — just talk';

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
      {/* A scenario Bixy just built — the user decides when to start it. */}
      {built && (
        <div className="animate-pop-in w-[300px] rounded-2xl border border-border bg-card p-4 text-left shadow-xl">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Bixy built this for you</p>
          <p className="mt-1 text-sm font-semibold leading-snug">{built.title}</p>
          {built.description && <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{built.description}</p>}
          {built.objective && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Goal: </span>{built.objective}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <span className="rounded-full border border-border px-2 py-0.5 capitalize">{built.difficulty}</span>
            <span className="rounded-full border border-border px-2 py-0.5">{languageName(built.language)}</span>
            <span className="rounded-full border border-border px-2 py-0.5">{built.voice}</span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => { const b = built; setBuilt(null); goToSleep(); router.push(`/session/${b.id}?lang=${b.language}&voice=${b.voice}&grade=0`); }}
              className="press flex-1 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
              Start the call
            </button>
            <button onClick={() => setBuilt(null)}
              className="press rounded-full border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
              Later
            </button>
          </div>
        </div>
      )}
      <div
        key={caption}
        className="tooltip-bob animate-pop-in max-w-[260px] rounded-2xl rounded-br-sm bg-zinc-900 text-white text-xs font-medium px-3.5 py-2 shadow-lg text-right line-clamp-3"
      >
        {caption}
      </div>
      <button
        onClick={toggle}
        className="relative grid h-32 w-32 place-items-center transition-transform hover:scale-105 active:scale-95"
        aria-label={awake ? 'Stop Bixy' : 'Wake Bixy'}
        title={awake ? 'Tap to stop' : 'Tap or say “Hey Bixy”'}
      >
        <span aria-hidden className="bixy-halo absolute inset-0 m-auto h-24 w-24" />
        <AssistantOrb state={orbState} size={128} />
      </button>
    </div>
  );
}

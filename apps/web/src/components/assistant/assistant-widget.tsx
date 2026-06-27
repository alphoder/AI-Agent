'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { LANGUAGES, languageName } from '@avatar-platform/shared';
import { useAuth } from '@/hooks/use-auth';
import { AssistantOrb, OrbState } from './assistant-orb';

interface Entry { role: 'user' | 'assistant'; text: string }

const BIXY_VOICE = 'Leda';
const WAKE = /\bbix(y|ie|i|ee)\b/i; // "hey bixy", "bixy", ...
const IDLE_MS = 45000;             // close the session only after this much true silence

const HINTS = [
  'Say “Hey Bixy” to wake me',
  '“Hey Bixy, show my scenarios”',
  '“Hey Bixy, start a job interview”',
  '“Hey Bixy, open my history”',
];

function systemPrompt(name: string) {
  return `You are Bixy — a cheerful, playful, slightly childlike voice helper for SpeakCoach, a speaking-practice app.
The user's name is ${name}. When they first wake you (e.g. "Hey Bixy"), greet them warmly BY NAME — like "Hey ${name}, how can I help you?" — then assist.
Speak in a warm, bubbly, youthful tone with short sentences. CALL the provided tools to actually do things —
search/list scenarios, start a practice session (optionally in a language), create a scenario, show history, or navigate.
Briefly confirm what you did. If a wake phrase like "hey bixy" appears in the message, ignore those words and act on the rest.`;
}

const TOOLS = [
  {
    function_declarations: [
      { name: 'navigate', description: 'Navigate the user to a page on the site.',
        parameters: { type: 'OBJECT', properties: { page: { type: 'STRING', enum: ['scenarios', 'reports', 'create_scenario'], description: 'Which page' } }, required: ['page'] } },
      { name: 'list_scenarios', description: 'List or search the available practice scenarios.',
        parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'optional search text' } } } },
      { name: 'start_practice', description: 'Start a practice session for a scenario the user names, optionally in a chosen language.',
        parameters: { type: 'OBJECT', properties: { scenario: { type: 'STRING', description: 'name or topic' }, language: { type: 'STRING', description: 'ISO code e.g. en, hi, es' } }, required: ['scenario'] } },
      { name: 'create_scenario', description: 'Create a new private practice scenario for the user.',
        parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, description: { type: 'STRING' }, objective: { type: 'STRING' }, character_prompt: { type: 'STRING', description: 'who the AI role-plays and how' }, language: { type: 'STRING' }, difficulty: { type: 'STRING', enum: ['beginner', 'intermediate', 'advanced'] } }, required: ['title', 'character_prompt'] } },
      { name: 'view_history', description: "Open the user's past practice sessions and scores.", parameters: { type: 'OBJECT', properties: {} } },
    ],
  },
];

const DEFAULT_RUBRIC = [
  { name: 'Clarity', description: 'How clear and well-structured the responses are', weight: 34, levels: [{ score: 1, label: 'Needs work', description: 'Confusing or rambling' }, { score: 3, label: 'Solid', description: 'Generally clear' }, { score: 5, label: 'Excellent', description: 'Crisp and compelling' }] },
  { name: 'Relevance', description: 'How well the learner addresses the goal', weight: 33, levels: [{ score: 1, label: 'Needs work', description: 'Off-topic' }, { score: 3, label: 'Solid', description: 'Mostly on-task' }, { score: 5, label: 'Excellent', description: 'Sharply on-point' }] },
  { name: 'Engagement', description: 'Confidence, rapport and responsiveness', weight: 33, levels: [{ score: 1, label: 'Needs work', description: 'Flat or passive' }, { score: 3, label: 'Solid', description: 'Engaged' }, { score: 5, label: 'Excellent', description: 'Confident and compelling' }] },
];

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
  useEffect(() => { nameRef.current = (user?.name || user?.email?.split('@')[0] || 'there').split(' ')[0]; }, [user]);

  const [ready, setReady] = useState(false);   // Gemini session live
  const [awake, setAwake] = useState(false);     // in a conversation
  const [speaking, setSpeaking] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [last, setLast] = useState<Entry | null>(null); // latest line, for the inline caption
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
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

  // Tear down the Gemini session and go quiet (only after real silence, or manual stop).
  const goToSleep = useCallback(() => {
    awakeRef.current = false;
    setAwake(false);
    setReady(false);
    setSpeaking(false);
    pendingRef.current = [];
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    try { wsRef.current?.close(1000); } catch { /* ignore */ }
    wsRef.current = null;
  }, []);

  // Keep-alive: any speech (or Bixy talking) pushes the silence deadline out.
  const bumpIdle = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => goToSleep(), IDLE_MS);
  }, [goToSleep]);

  const executeTool = useCallback(async (name: string, args: Record<string, unknown>) => {
    try {
      if (name === 'navigate') {
        const map: Record<string, string> = { scenarios: '/scenarios', reports: '/reports', create_scenario: '/scenarios/create' };
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
        const payload = {
          title: String(args.title), description: args.description ? String(args.description) : '',
          objective: args.objective ? String(args.objective) : `Practise: ${args.title}`,
          system_prompt: String(args.character_prompt), opening_message: '',
          language: resolveLang(args.language as string) || 'en', voice: 'Aoede',
          difficulty_level: ['beginner', 'intermediate', 'advanced'].includes(String(args.difficulty)) ? String(args.difficulty) : 'intermediate',
          visibility: 'private', tags: [], scoring_rubric: DEFAULT_RUBRIC,
        };
        const { data } = await apiClient.post('/scenarios', payload);
        return { ok: true, id: data.data.id, title: payload.title };
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

  // Heard locally. Wake on "Hey Bixy"; once awake, every utterance keeps the chat going.
  const onHeard = useCallback((text: string) => {
    if (!awakeRef.current) {
      if (!WAKE.test(text)) return;     // not addressed → stay asleep
      wake();
    }
    sendToGemini(text);
    bumpIdle();
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
        ws.onopen = () => ws.send(JSON.stringify({ type: 'config', system_prompt: systemPrompt(nameRef.current), voice: BIXY_VOICE, tools: TOOLS }));
        ws.onmessage = async (ev) => {
          const msg = JSON.parse(ev.data);
          switch (msg.type) {
            case 'listening': {
              connectingRef.current = false;
              setReady(true); setError(null); bumpIdle();
              const queued = pendingRef.current; pendingRef.current = [];
              queued.forEach((text) => ws.send(JSON.stringify({ type: 'text', text })));
              break;
            }
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
          // Reconnect only if the user is still in the conversation.
          if (mountedRef.current && awakeRef.current) {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            reconnectRef.current = setTimeout(() => connect(), 2000);
          }
        };
      })
      .catch(() => { connectingRef.current = false; if (mountedRef.current) setError('Bixy is offline right now.'); });
  }, [executeTool, playAudio, bumpIdle]);
  connectRef.current = connect;

  function toggle() {
    if (awakeRef.current) goToSleep();
    else wake();
  }

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
      outCtxRef.current?.close().catch(() => {});
    };
  }, [startRecognizer]);

  // Inline caption (no panel) — speaks for itself right on the orb.
  let caption: string;
  if (unsupported) caption = 'Tap me — voice needs Chrome';
  else if (error) caption = error;
  else if (!awake) caption = HINTS[hint];
  else if (!ready) caption = 'Waking up…';
  else if (speaking) caption = last?.role === 'assistant' ? last.text : 'Mm-hmm…';
  else caption = last?.role === 'user' ? `“${last.text}”` : 'Listening — just talk';

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
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

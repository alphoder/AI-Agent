'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, MicOff, X } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { LANGUAGES, languageName } from '@avatar-platform/shared';
import { AssistantOrb, OrbState } from './assistant-orb';

interface Entry { role: 'user' | 'assistant'; text: string }

const BIXY_VOICE = 'Leda'; // youthful / child-like

// Playful hint popups shown over Bixy when he's idle.
const HINTS = [
  "Hi! I'm Bixy 👋 tap me",
  'Ask me to start a practice!',
  'Want to see your scenarios?',
  'I can make a new scenario for you!',
  "Say “open my history” 📊",
];

const SUGGESTIONS = [
  'Show my scenarios',
  'Practise a job interview in Hindi',
  'Create a scenario to say no to my boss',
  'Open my history',
];

const SYSTEM_PROMPT = `You are Bixy — a cheerful, playful, slightly childlike voice helper for SpeakCoach, a speaking-practice app.
Speak in a warm, bubbly, youthful tone with short, upbeat sentences (1 sentence when you can).
Help the user by CALLING the provided tools — actually do things, don't just describe them.
You can: search/list practice scenarios, start a practice session (optionally in a chosen language),
create a new scenario, show the user's history/reports, and navigate pages.
After doing something, give a short happy confirmation. If they want to practise something that doesn't
exist yet, offer to create it. Always introduce yourself as Bixy if asked who you are.`;

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

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
function abToB64(buffer: ArrayBuffer): string {
  let bin = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
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
  const [ready, setReady] = useState(false);   // WS + Gemini live (loaded at startup)
  const [engaged, setEngaged] = useState(false); // user tapped → mic is on
  const [speaking, setSpeaking] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [transcripts, setTranscripts] = useState<Entry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inCtxRef = useRef<AudioContext | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const playCursorRef = useRef(0);
  const micOnRef = useRef(false);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const orbState: OrbState = !engaged ? 'asleep' : !ready ? 'loading' : speaking ? 'speaking' : 'listening';

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcripts, actions]);

  // Rotate idle hint popups.
  useEffect(() => {
    if (engaged) return;
    const t = setInterval(() => setHint((h) => (h + 1) % HINTS.length), 4200);
    return () => clearInterval(t);
  }, [engaged]);

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

  const logAction = (msg: string) => setActions((a) => [...a.slice(-5), msg]);

  const executeTool = useCallback(async (name: string, args: Record<string, unknown>) => {
    try {
      if (name === 'navigate') {
        const map: Record<string, string> = { scenarios: '/scenarios', reports: '/reports', create_scenario: '/scenarios/create' };
        const path = map[String(args.page)] || '/scenarios';
        logAction(`Opening ${path}`); router.push(path); return { ok: true, navigated_to: path };
      }
      if (name === 'list_scenarios') {
        const q = args.query ? `?q=${encodeURIComponent(String(args.query))}` : '';
        const { data } = await apiClient.get(`/scenarios${q}`);
        const list = data.data.slice(0, 10).map((s: { id: string; title: string; language: string; difficulty_level: string }) => ({ id: s.id, title: s.title, language: s.language, difficulty: s.difficulty_level }));
        logAction(`Found ${list.length} scenario(s)`); return { scenarios: list };
      }
      if (name === 'start_practice') {
        const { data } = await apiClient.get(`/scenarios?q=${encodeURIComponent(String(args.scenario))}`);
        const match = data.data[0];
        if (!match) return { error: `No scenario found matching "${args.scenario}". Offer to create one.` };
        const lang = resolveLang(args.language as string) || match.language || 'en';
        logAction(`Starting "${match.title}" in ${languageName(lang)}`);
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
        logAction(`Created "${payload.title}"`); return { ok: true, id: data.data.id, title: payload.title };
      }
      if (name === 'view_history') {
        logAction('Opening your history'); router.push('/reports');
        const { data } = await apiClient.get('/sessions');
        return { sessions: data.data.slice(0, 8).map((s: { scenario_title: string; overall_score: number | null }) => ({ scenario: s.scenario_title, score: s.overall_score })) };
      }
      return { error: `Unknown tool ${name}` };
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      return { error: m || 'tool failed' };
    }
  }, [router]);

  // Establish the WS + Gemini session at STARTUP (no mic yet). Clicking Bixy
  // later just turns the mic on — there's no "waking up" delay then.
  const connect = useCallback(() => {
    if (wsRef.current) return;
    apiClient
      .post('/assistant/session')
      .then(({ data }) => {
        if (!mountedRef.current) return;
        outCtxRef.current = outCtxRef.current || new AudioContext({ sampleRate: 24000 });
        const ws = new WebSocket(data.data.wsUrl);
        wsRef.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: 'config', system_prompt: SYSTEM_PROMPT, voice: BIXY_VOICE, tools: TOOLS }));
        ws.onmessage = async (ev) => {
          const msg = JSON.parse(ev.data);
          switch (msg.type) {
            case 'listening': setReady(true); setError(null); break;
            case 'transcript': if (msg.text) setTranscripts((t) => [...t, { role: 'user', text: msg.text }]); break;
            case 'response_text': if (msg.text) setTranscripts((t) => [...t, { role: 'assistant', text: msg.text }]); break;
            case 'audio_out': playAudio(msg.data); break;
            case 'tool_call': {
              const responses = [];
              for (const c of (msg.calls || [])) responses.push({ id: c.id, name: c.name, response: await executeTool(c.name, c.args || {}) });
              ws.send(JSON.stringify({ type: 'tool_response', responses }));
              break;
            }
            case 'error': setError(msg.message || 'assistant error'); break;
          }
        };
        ws.onclose = () => {
          wsRef.current = null;
          setReady(false); setSpeaking(false);
          // Keep Bixy ready: reconnect in the background while mounted.
          if (mountedRef.current) {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            reconnectRef.current = setTimeout(() => connect(), 4000);
          }
        };
      })
      .catch(() => { if (mountedRef.current) setError('Bixy is offline right now.'); });
  }, [executeTool, playAudio]);

  // Tap Bixy → switch the mic ON (acquire it once, then just toggle the track).
  const engage = useCallback(async () => {
    setEngaged(true);
    setTranscripts([]);
    try {
      await outCtxRef.current?.resume();
      if (!micStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        const inCtx = new AudioContext({ sampleRate: 16000 });
        inCtxRef.current = inCtx;
        const source = inCtx.createMediaStreamSource(stream);
        const proc = inCtx.createScriptProcessor(4096, 1, 1);
        source.connect(proc); proc.connect(inCtx.destination);
        proc.onaudioprocess = (e) => {
          if (!micOnRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
          wsRef.current.send(JSON.stringify({ type: 'audio', data: abToB64(floatTo16BitPCM(e.inputBuffer.getChannelData(0))) }));
        };
      }
      micStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = true));
      micOnRef.current = true; setMicOn(true);
      wsRef.current?.send(JSON.stringify({ type: 'mic_on' }));
    } catch {
      setError('Bixy needs your microphone — please allow it.');
    }
  }, []);

  // Close the panel → mute + release the mic, but KEEP the session loaded.
  const disengage = useCallback(() => {
    micOnRef.current = false; setMicOn(false); setEngaged(false); setSpeaking(false);
    wsRef.current?.send(JSON.stringify({ type: 'mic_off' }));
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    inCtxRef.current?.close().catch(() => {});
    inCtxRef.current = null;
  }, []);

  function toggleMic() {
    const next = !micOn; setMicOn(next); micOnRef.current = next;
    micStreamRef.current?.getAudioTracks().forEach((tr) => (tr.enabled = next));
    wsRef.current?.send(JSON.stringify({ type: next ? 'mic_on' : 'mic_off' }));
  }
  function say(text: string) {
    if (!engaged) engage();
    wsRef.current?.send(JSON.stringify({ type: 'text', text }));
  }

  // Load at startup; tear down on unmount.
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (speakTimerRef.current) clearTimeout(speakTimerRef.current);
      try { wsRef.current?.close(); } catch { /* ignore */ }
      wsRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      inCtxRef.current?.close().catch(() => {});
      outCtxRef.current?.close().catch(() => {});
    };
  }, [connect]);

  return (
    <>
      {/* Idle: just Bixy + a rotating hint popup. No chat box. */}
      {!engaged && (
        <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
          <button
            key={hint}
            onClick={() => say(HINTS[hint])}
            className="tooltip-bob animate-pop-in max-w-[200px] rounded-2xl rounded-br-sm bg-slate-900 text-white text-xs font-medium px-3.5 py-2 shadow-lg text-right"
          >
            {HINTS[hint]}
          </button>
          <button onClick={engage} className="grid place-items-center h-40 w-40 hover:scale-105 active:scale-95 transition-transform" aria-label="Talk to Bixy">
            <AssistantOrb state="asleep" size={160} />
          </button>
        </div>
      )}

      {/* Loading: just Bixy with a spinner ring + dizzy face. No card. */}
      {engaged && !ready && (
        <div className="fixed bottom-5 right-5 z-40 grid place-items-center h-40 w-40 animate-pop-in">
          <AssistantOrb state="loading" size={160} />
        </div>
      )}

      {/* In use: the panel */}
      {engaged && ready && (
        <div className="fixed bottom-5 right-5 z-40 w-[360px] max-h-[80vh] rounded-3xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden animate-pop-in">
          <div className="relative flex flex-col items-center pt-6 pb-3 bg-gradient-to-b from-indigo-50 to-transparent">
            <button onClick={disengage} className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            <AssistantOrb state={orbState} size={112} />
            <p className="mt-1 text-sm font-semibold">Bixy</p>
            <p className="text-[11px] text-muted-foreground">{speaking ? 'talking…' : 'listening…'}</p>
          </div>

          <div className="flex-1 overflow-y-auto thin-scroll px-4 space-y-2 text-sm min-h-[40px]">
            {transcripts.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 ${t.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-muted'}`}>{t.text}</div>
              </div>
            ))}
            {actions.map((a, i) => (<div key={`a${i}`} className="text-[11px] text-indigo-600 flex items-center gap-1.5">✨ {a}</div>))}
            {error && <div className="text-xs text-rose-600">{error}</div>}
            <div ref={endRef} />
          </div>

          <div className="px-4 pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Try saying</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s, i) => (
                <button key={s} onClick={() => say(s)} disabled={!ready} style={{ animationDelay: `${i * 60}ms` }}
                  className="animate-chip-in rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 px-3 py-1 text-xs font-medium hover:bg-indigo-100 disabled:opacity-50 transition-colors">{s}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center p-4">
            <button onClick={toggleMic} disabled={!ready} className={`rounded-full p-3 transition-colors disabled:opacity-50 ${micOn ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-rose-500 text-white'}`} title="Toggle mic">
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

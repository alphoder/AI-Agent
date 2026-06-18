'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { LANGUAGES, languageName } from '@avatar-platform/shared';
import { useAuth } from '@/hooks/use-auth';
import { AssistantOrb, OrbState } from './assistant-orb';

interface Entry { role: 'user' | 'assistant'; text: string }

const BIXY_VOICE = 'Leda';
const WAKE = /\bbix(y|ie|i|ee)\b/i; // "hey bixy", "bixy", ...

const HINTS = [
  'Say “Hey Bixy” to wake me',
  '“Hey Bixy, show my scenarios”',
  '“Hey Bixy, start a job interview”',
  '“Hey Bixy, open my history”',
];
const SUGGESTIONS = ['Show my scenarios', 'Practise a job interview in Hindi', 'Create a scenario to say no to my boss', 'Open my history'];

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

  const [ready, setReady] = useState(false);   // Gemini WS connected (voice output)
  const [panel, setPanel] = useState(false);    // conversation panel visible / awake
  const [speaking, setSpeaking] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [transcripts, setTranscripts] = useState<Entry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const playCursorRef = useRef(0);
  const awakeRef = useRef(false);
  const recRef = useRef<any>(null);
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const orbState: OrbState = !ready ? 'loading' : speaking ? 'speaking' : panel ? 'listening' : 'asleep';

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [transcripts, actions]);
  useEffect(() => {
    if (panel) return;
    const t = setInterval(() => setHint((h) => (h + 1) % HINTS.length), 4200);
    return () => clearInterval(t);
  }, [panel]);

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

  const sleepSoon = useCallback(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    sleepTimerRef.current = setTimeout(() => { awakeRef.current = false; setPanel(false); }, 16000);
  }, []);

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

  // Send a user utterance to Gemini (text-in, voice-out). Local Web Speech does the STT.
  const sendToGemini = useCallback((text: string) => {
    if (!text.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    outCtxRef.current?.resume().catch(() => {});
    setTranscripts((t) => [...t, { role: 'user', text }]);
    wsRef.current.send(JSON.stringify({ type: 'text', text }));
  }, []);

  // Heard locally (Web Speech). Wake on "Hey Bixy", then keep the conversation going.
  const onHeard = useCallback((text: string) => {
    if (!awakeRef.current) {
      if (!WAKE.test(text)) return;            // not addressed → ignore
      awakeRef.current = true;
      setPanel(true);
    }
    sendToGemini(text);
    sleepSoon();
  }, [sendToGemini, sleepSoon]);

  const startRecognizer = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setUnsupported(true); return; }
    if (recRef.current) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1];
      if (r && r.isFinal) onHeard((r[0].transcript || '').trim());
    };
    rec.onerror = () => { /* keep going */ };
    rec.onend = () => { if (mountedRef.current) { try { rec.start(); } catch { /* already running */ } } };
    try { rec.start(); } catch { /* ignore */ }
    recRef.current = rec;
  }, [onHeard]);

  const connect = useCallback(() => {
    if (wsRef.current) return;
    apiClient
      .post('/assistant/session')
      .then(({ data }) => {
        if (!mountedRef.current) return;
        outCtxRef.current = outCtxRef.current || new AudioContext({ sampleRate: 24000 });
        const ws = new WebSocket(data.data.wsUrl);
        wsRef.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: 'config', system_prompt: systemPrompt(nameRef.current), voice: BIXY_VOICE, tools: TOOLS }));
        ws.onmessage = async (ev) => {
          const msg = JSON.parse(ev.data);
          switch (msg.type) {
            case 'listening': setReady(true); setError(null); break;
            case 'response_text': if (msg.text) setTranscripts((t) => [...t, { role: 'assistant', text: msg.text }]); break;
            case 'audio_out': playAudio(msg.data); break;
            case 'tool_call': {
              const responses = [];
              for (const c of (msg.calls || [])) responses.push({ id: c.id, name: c.name, response: await executeTool(c.name, c.args || {}) });
              ws.send(JSON.stringify({ type: 'tool_response', responses }));
              break;
            }
            case 'response_end': sleepSoon(); break;
            case 'error': setError(msg.message || 'assistant error'); break;
          }
        };
        ws.onclose = () => {
          wsRef.current = null; setReady(false); setSpeaking(false);
          if (mountedRef.current) {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            reconnectRef.current = setTimeout(() => connect(), 4000);
          }
        };
      })
      .catch(() => { if (mountedRef.current) setError('Bixy is offline right now.'); });
  }, [executeTool, playAudio, sleepSoon]);

  function say(text: string) {
    awakeRef.current = true; setPanel(true);
    sendToGemini(text); sleepSoon();
  }

  useEffect(() => {
    mountedRef.current = true;
    connect();
    startRecognizer();
    const resume = () => outCtxRef.current?.resume().catch(() => {});
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      [reconnectRef, speakTimerRef, sleepTimerRef].forEach((r) => r.current && clearTimeout(r.current));
      try { recRef.current?.stop(); } catch { /* ignore */ }
      try { wsRef.current?.close(); } catch { /* ignore */ }
      outCtxRef.current?.close().catch(() => {});
    };
  }, [connect, startRecognizer]);

  return (
    <>
      {!panel && (
        <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
          <div key={hint} className="tooltip-bob animate-pop-in max-w-[230px] rounded-2xl rounded-br-sm bg-zinc-900 text-white text-xs font-medium px-3.5 py-2 shadow-lg text-right">
            {unsupported ? 'Tap me to chat (voice needs Chrome)' : !ready ? 'Bixy is waking up…' : HINTS[hint]}
          </div>
          <button onClick={() => { awakeRef.current = true; setPanel(true); outCtxRef.current?.resume().catch(() => {}); }}
            className="grid place-items-center h-40 w-40 hover:scale-105 active:scale-95 transition-transform" aria-label="Bixy">
            <AssistantOrb state={orbState} size={160} />
          </button>
        </div>
      )}

      {panel && (
        <div className="fixed bottom-5 right-5 z-40 w-[360px] max-h-[80vh] rounded-3xl border border-zinc-200/70 bg-white/95 backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden animate-pop-in">
          <div className="relative flex flex-col items-center pt-6 pb-3 bg-gradient-to-b from-blue-50 to-transparent">
            <button onClick={() => { setPanel(false); awakeRef.current = false; }} className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
            <AssistantOrb state={orbState} size={104} />
            <p className="mt-1 text-sm font-semibold">Bixy</p>
            <p className="text-[11px] text-zinc-400">{speaking ? 'talking…' : 'listening — just speak'}</p>
          </div>

          <div className="flex-1 overflow-y-auto thin-scroll px-4 space-y-2 text-sm min-h-[40px]">
            {transcripts.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 ${t.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-800'}`}>{t.text}</div>
              </div>
            ))}
            {actions.map((a, i) => (<div key={`a${i}`} className="text-[11px] text-blue-600 flex items-center gap-1.5">✨ {a}</div>))}
            {error && <div className="text-xs text-rose-600">{error}</div>}
            <div ref={endRef} />
          </div>

          <div className="px-4 pt-3 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Or tap to ask</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s, i) => (
                <button key={s} onClick={() => say(s)} disabled={!ready} style={{ animationDelay: `${i * 60}ms` }}
                  className="animate-chip-in rounded-full border border-blue-200 bg-blue-50 text-blue-700 px-3 py-1 text-xs font-medium hover:bg-blue-100 disabled:opacity-50 transition-colors">{s}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

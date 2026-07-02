'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Mic, MicOff, PhoneOff, Loader2, Video, VideoOff } from 'lucide-react';
import apiClient from '@/lib/api-client';

interface TranscriptEntry { role: 'user' | 'assistant'; text: string }
interface SessionConfig {
  scenarioTitle: string;
  systemPrompt: string;
  openingMessage: string | null;
  voice: string;
  language: string;
  maxDurationSec: number;
}

const FRAME_INTERVAL_MS = 8000;

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function SessionInner() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const scenarioId = params.id as string;
  const chosenLang = search.get('lang') || undefined;
  const chosenVoice = search.get('voice') || undefined;

  const [phase, setPhase] = useState<'connecting' | 'live' | 'ending'>('connecting');
  const [status, setStatus] = useState('Setting up…');
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [interim, setInterim] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [coachSpeaking, setCoachSpeaking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [config, setConfig] = useState<SessionConfig | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inCtxRef = useRef<AudioContext | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const playCursorRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micOnRef = useRef(true);
  const endedRef = useRef(false);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, interim]);

  const playAudioChunk = useCallback((base64: string) => {
    const ctx = outCtxRef.current;
    if (!ctx) return;
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    const startAt = Math.max(now, playCursorRef.current);
    src.start(startAt);
    playCursorRef.current = startAt + buffer.duration;
    setCoachSpeaking(true);
    src.onended = () => {
      if (playCursorRef.current - ctx.currentTime < 0.05) setCoachSpeaking(false);
    };
  }, []);

  const cleanup = useCallback(() => {
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    try { wsRef.current?.close(); } catch { /* ignore */ }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    inCtxRef.current?.close().catch(() => {});
    outCtxRef.current?.close().catch(() => {});
  }, []);

  const endSession = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setPhase('ending');
    setStatus('Scoring your session…');
    cleanup();
    const sid = sessionIdRef.current;
    if (sid) {
      try { await apiClient.post(`/sessions/${sid}/end`); } catch { /* ignore */ }
      router.push(`/reports?session=${sid}`);
    } else {
      router.push('/scenarios');
    }
  }, [cleanup, router]);

  // Boot the session once.
  useEffect(() => {
    let disposed = false;

    async function boot() {
      try {
        // 1. Create the session on the server (strict language from the picker).
        const { data } = await apiClient.post('/sessions', { scenario_id: scenarioId, language: chosenLang, voice: chosenVoice });
        if (disposed) return;
        const { sessionId, wsUrl, sessionConfig } = data.data;
        sessionIdRef.current = sessionId;
        setConfig(sessionConfig);

        // 2. Mic + camera.
        setStatus('Requesting mic & camera…');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (disposed) { stream.getTracks().forEach((t) => t.stop()); return; }
        micStreamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;

        // 3. Audio out context (Gemini returns 24kHz PCM).
        outCtxRef.current = new AudioContext({ sampleRate: 24000 });

        // 4. Open the WS to the AI service — with retry. A free-tier service can
        //    be waking from a cold start (~30-60s), during which the first
        //    upgrade fails; we retry a few times before giving up.
        const MAX_ATTEMPTS = 6;
        let attempt = 0;
        let live = false;

        // Mic + body-language capture — wired once, the moment the coach is
        // actually listening (so failed/cold attempts never leak an AudioContext).
        const startCapture = (ws: WebSocket) => {
          if (inCtxRef.current) return;
          const inCtx = new AudioContext({ sampleRate: 16000 });
          inCtxRef.current = inCtx;
          const source = inCtx.createMediaStreamSource(stream);
          const processor = inCtx.createScriptProcessor(4096, 1, 1);
          source.connect(processor);
          processor.connect(inCtx.destination);
          processor.onaudioprocess = (e) => {
            if (!micOnRef.current || ws.readyState !== WebSocket.OPEN) return;
            const pcm = floatTo16BitPCM(e.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ type: 'audio', data: arrayBufferToBase64(pcm) }));
          };
          frameTimerRef.current = setInterval(() => {
            const video = videoRef.current;
            if (!video || video.readyState < 2 || ws.readyState !== WebSocket.OPEN) return;
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320) || 240;
            const g = canvas.getContext('2d');
            if (!g) return;
            g.drawImage(video, 0, 0, canvas.width, canvas.height);
            const jpeg = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
            if (jpeg) ws.send(JSON.stringify({ type: 'video_frame', data: jpeg }));
          }, FRAME_INTERVAL_MS);
        };

        const openWs = () => {
          attempt += 1;
          setStatus(attempt === 1 ? 'Connecting to your coach…' : 'Waking your coach… the first connection can take up to a minute.');
          const ws = new WebSocket(wsUrl);
          wsRef.current = ws;

          ws.onopen = () => {
            ws.send(JSON.stringify({
              type: 'config',
              system_prompt: sessionConfig.systemPrompt,
              voice: sessionConfig.voice,
              language: sessionConfig.language,
            }));
          };

          ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            switch (msg.type) {
              case 'listening':
                live = true;
                setPhase('live');
                setStatus('');
                startCapture(ws);
                break;
              case 'transcript_interim':
                setInterim(msg.text);
                break;
              case 'transcript':
                setInterim('');
                if (msg.text) setTranscripts((t) => [...t, { role: 'user', text: msg.text }]);
                break;
              case 'response_text':
                if (msg.text) setTranscripts((t) => [...t, { role: 'assistant', text: msg.text }]);
                break;
              case 'audio_out':
                playAudioChunk(msg.data);
                break;
              case 'response_end':
                break;
              case 'error':
                setError(msg.message || 'Coach connection error');
                break;
            }
          };

          ws.onerror = () => { /* surfaced via onclose so we can retry */ };
          ws.onclose = () => {
            if (disposed || endedRef.current) return;
            if (live) { setStatus('Connection closed.'); return; }
            if (attempt < MAX_ATTEMPTS) {
              setTimeout(() => { if (!disposed && !endedRef.current) openWs(); }, 2500);
            } else {
              setError('Could not reach the coach. It may be waking up. Please try again in a minute.');
            }
          };
        };

        openWs();
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        setError(msg || 'Could not start the session. Please allow mic & camera access and try again.');
      }
    }

    boot();
    return () => {
      disposed = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId]);

  // Elapsed timer + auto-end at max duration.
  useEffect(() => {
    if (phase !== 'live') return;
    const t = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (config && next >= config.maxDurationSec) endSession();
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, config, endSession]);

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    micOnRef.current = next;
    micStreamRef.current?.getAudioTracks().forEach((tr) => (tr.enabled = next));
    wsRef.current?.send(JSON.stringify({ type: next ? 'mic_on' : 'mic_off' }));
  }

  function toggleCam() {
    const next = !camOn;
    setCamOn(next);
    micStreamRef.current?.getVideoTracks().forEach((tr) => (tr.enabled = next));
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-white/10">
        <div className="text-sm font-medium truncate">{config?.scenarioTitle || 'Session'}</div>
        <div className="flex items-center gap-3 text-sm">
          <span className={`flex items-center gap-1.5 ${phase === 'live' ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`h-2 w-2 rounded-full ${phase === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            {phase === 'live' ? 'Live' : phase === 'ending' ? 'Wrapping up' : 'Connecting'}
          </span>
          <span className="tabular-nums text-white/70">{mm}:{ss}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1.4fr)] lg:grid-rows-1 lg:grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* Self-view */}
        <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          {!camOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-white/50">
              <VideoOff className="h-10 w-10" />
            </div>
          )}
          <div className="absolute bottom-3 left-3 text-xs bg-black/50 px-2 py-1 rounded-full">You</div>
          <div className={`absolute top-3 right-3 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors ${coachSpeaking ? 'bg-blue-500' : 'bg-white/10'}`}>
            <Mic className="h-3 w-3" /> {coachSpeaking ? 'Coach speaking' : 'Coach listening'}
          </div>
        </div>

        {/* Transcript */}
        <div className="min-h-0 rounded-2xl bg-white/5 flex flex-col overflow-hidden">
          <div className="shrink-0 px-4 py-3 border-b border-white/10 text-sm font-medium">Transcript</div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-smooth p-4 space-y-3">
            {transcripts.length === 0 && !interim && (
              <p className="text-white/40 text-sm">Say hello to begin the conversation.</p>
            )}
            {transcripts.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${t.role === 'user' ? 'bg-blue-600' : 'bg-white/10'}`}>
                  {t.text}
                </div>
              </div>
            ))}
            {interim && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl px-3.5 py-2 text-sm bg-blue-600/40 italic">{interim}</div>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="h-20 border-t border-white/10 flex items-center justify-center gap-3">
        {phase === 'connecting' && !error && (
          <div className="flex items-center gap-2 text-white/70 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> {status}</div>
        )}
        {error && <div className="text-rose-400 text-sm">{error}</div>}
        {phase === 'live' && (
          <>
            <button onClick={toggleMic} className={`rounded-full p-4 ${micOn ? 'bg-white/10 hover:bg-white/20' : 'bg-rose-500'}`} title="Toggle mic">
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button onClick={toggleCam} className={`rounded-full p-4 ${camOn ? 'bg-white/10 hover:bg-white/20' : 'bg-rose-500'}`} title="Toggle camera">
              {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
          </>
        )}
        {(phase === 'live' || error) && (
          <button onClick={endSession} className="rounded-full bg-rose-600 hover:bg-rose-700 px-6 py-4 flex items-center gap-2 text-sm font-medium" title="End session">
            <PhoneOff className="h-5 w-5" /> End & get feedback
          </button>
        )}
        {phase === 'ending' && (
          <div className="flex items-center gap-2 text-white/70 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> {status}</div>
        )}
      </div>
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionInner />
    </Suspense>
  );
}

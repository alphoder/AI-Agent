'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Mic, MicOff, PhoneOff, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api-client';

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
  const gradeBody = search.get('grade') === '1'; // body-language grading OFF by default; on only when opted in

  const [phase, setPhase] = useState<'connecting' | 'live' | 'ending'>('connecting');
  const [status, setStatus] = useState('Setting up…');
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState<{ role: 'you' | 'customer'; text: string } | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [config, setConfig] = useState<SessionConfig | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inCtxRef = useRef<AudioContext | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const playCursorRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micOnRef = useRef(true);
  const micLevelRef = useRef(0);
  const runningRef = useRef(false);
  const endedRef = useRef(false);
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gradeBodyActiveRef = useRef(gradeBody);

  const showCaption = useCallback((role: 'you' | 'customer', text: string) => {
    if (!text) return;
    setCaption({ role, text });
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setCaption(null), 6000);
  }, []);

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
    src.connect(analyserRef.current || ctx.destination); // route through analyser so the sphere reacts
    const now = ctx.currentTime;
    const startAt = Math.max(now, playCursorRef.current);
    src.start(startAt);
    playCursorRef.current = startAt + buffer.duration;
  }, []);

  const cleanup = useCallback(() => {
    if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    if (captionTimer.current) clearTimeout(captionTimer.current);
    runningRef.current = false;
    try { wsRef.current?.close(); } catch { /* ignore */ }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    inCtxRef.current?.close().catch(() => {});
    outCtxRef.current?.close().catch(() => {});
  }, []);

  const endSession = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setPhase('ending');
    setStatus('Scoring your call…');
    cleanup();
    const sid = sessionIdRef.current;
    if (sid) {
      try { await apiClient.post(`/sessions/${sid}/end`); } catch { /* ignore */ }
      router.push(`/reports?session=${sid}`);
    } else {
      router.push('/scenarios');
    }
  }, [cleanup, router]);

  // ---- particle sphere: white points on black; expands when the customer
  // speaks, closes inward when listening. Adapted for our audio pipeline. ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;

    const N = 620, pts: number[][] = [], golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
      pts.push([Math.cos(th) * rad, y, Math.sin(th) * rad]);
    }
    const resize = () => { const r = canvas.getBoundingClientRect(); canvas.width = r.width * DPR; canvas.height = r.height * DPR; };
    resize();
    window.addEventListener('resize', resize);

    const freq = new Uint8Array(256);
    let smoothOut = 0, wavePhase = 0, speakW = 0, listenW = 0;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const t = now / 1000;
      const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
      ctx.clearRect(0, 0, W, H);

      let out = 0;
      const an = analyserRef.current;
      if (an) {
        an.getByteTimeDomainData(freq);
        let s = 0;
        for (let i = 0; i < freq.length; i++) { const d = (freq[i] - 128) / 128; s += d * d; }
        out = Math.sqrt(s / freq.length);
      }
      smoothOut = smoothOut * 0.85 + out * 0.15;
      const micS = Math.min(1, micLevelRef.current * 9);
      const running = runningRef.current;
      const speaking = running && smoothOut > 0.02;
      const listening = running && !speaking;
      speakW += ((speaking ? 1 : 0) - speakW) * 0.07;
      listenW += ((listening ? 1 : 0) - listenW) * 0.07;
      wavePhase = (wavePhase + 0.006 + smoothOut * 0.018) % 1;

      const baseR = Math.min(W, H) * 0.20;
      const breathe = reduced ? 0 : Math.sin(t * 1.2) * 0.02;
      const R = baseR * (1 + breathe + speakW * Math.min(0.22, smoothOut * 1.3) + listenW * micS * 0.06);

      const halo = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 2.2);
      halo.addColorStop(0, `rgba(255,255,255,${0.06 + speakW * smoothOut * 0.25})`);
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, R * 2.2, 0, 7); ctx.fill();

      const speed = 0.1 + speakW * 0.4 + listenW * 0.12;
      const ry = reduced ? 0.6 : t * speed;
      const rx = reduced ? 0.4 : Math.sin(t * 0.15) * 0.35 + 0.3;
      const cosY = Math.cos(ry), sinY = Math.sin(ry), cosX = Math.cos(rx), sinX = Math.sin(rx);
      const persp = 3.2, jitter = speakW * smoothOut * 0.5;

      for (let i = 0; i < N; i++) {
        let [x, y, z] = pts[i];
        if (jitter) { const j = 1 + Math.sin(i * 12.9898 + t * 7) * jitter * 0.28; x *= j; y *= j; z *= j; }
        const x1 = x * cosY + z * sinY, z1 = -x * sinY + z * cosY;
        const y1 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
        const s = persp / (persp - z2);
        const px = cx + x1 * R * s, py = cy + y1 * R * s;
        const depth = (z2 + 1) / 2;
        ctx.fillStyle = `rgba(255,255,255,${0.12 + depth * 0.75})`;
        ctx.beginPath(); ctx.arc(px, py, (0.7 + depth * 1.5) * DPR, 0, 7); ctx.fill();
      }

      if (!reduced && (speakW > 0.01 || listenW > 0.01)) {
        ctx.lineWidth = 1.2 * DPR;
        for (let k = 0; k < 3; k++) {
          const ph = (wavePhase + k / 3) % 1;
          const fade = Math.sin(ph * Math.PI);
          if (speakW > 0.01) {
            const rr = R * (1.05 + ph * 0.85);
            ctx.strokeStyle = `rgba(255,255,255,${fade * (0.14 + smoothOut * 0.4) * speakW})`;
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.stroke();
          }
          if (listenW > 0.01) {
            const rr = R * (1.5 - ph * 0.5);
            ctx.strokeStyle = `rgba(255,255,255,${fade * (0.12 + micS * 0.38) * listenW})`;
            ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.stroke();
          }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  // Boot the session once.
  useEffect(() => {
    let disposed = false;

    async function boot() {
      try {
        const { data } = await apiClient.post('/sessions', { scenario_id: scenarioId, language: chosenLang, voice: chosenVoice });
        if (disposed) return;
        const { sessionId, wsUrl, sessionConfig } = data.data;
        sessionIdRef.current = sessionId;
        setConfig(sessionConfig);

        // Mic always; camera only when body-language grading is on.
        setStatus(gradeBody ? 'Requesting mic & camera…' : 'Requesting microphone…');
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: gradeBody });
          gradeBodyActiveRef.current = gradeBody;
        } catch (mediaErr) {
          if (gradeBody) {
            console.warn('Camera failed or denied, falling back to audio only:', mediaErr);
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            gradeBodyActiveRef.current = false;
          } else {
            throw mediaErr;
          }
        }
        if (disposed) { stream.getTracks().forEach((t) => t.stop()); return; }
        micStreamRef.current = stream;
        if (gradeBodyActiveRef.current && videoRef.current) videoRef.current.srcObject = stream;

        // Audio out (Gemini returns 24kHz PCM) + analyser for the sphere.
        const outCtx = new AudioContext({ sampleRate: 24000 });
        outCtxRef.current = outCtx;
        const an = outCtx.createAnalyser();
        an.fftSize = 512;
        an.connect(outCtx.destination);
        analyserRef.current = an;

        const MAX_ATTEMPTS = 6;
        let attempt = 0;
        let live = false;

        const startCapture = (ws: WebSocket) => {
          if (inCtxRef.current) return;
          const inCtx = new AudioContext({ sampleRate: 16000 });
          inCtxRef.current = inCtx;
          const source = inCtx.createMediaStreamSource(stream);
          const processor = inCtx.createScriptProcessor(4096, 1, 1);
          source.connect(processor);
          processor.connect(inCtx.destination);
          processor.onaudioprocess = (e) => {
            const ch = e.inputBuffer.getChannelData(0);
            let s = 0; for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
            micLevelRef.current = micLevelRef.current * 0.8 + Math.sqrt(s / ch.length) * 0.2; // for the sphere
            if (!micOnRef.current || ws.readyState !== WebSocket.OPEN) return;
            ws.send(JSON.stringify({ type: 'audio', data: arrayBufferToBase64(floatTo16BitPCM(ch)) }));
          };
          if (gradeBodyActiveRef.current) {
            frameTimerRef.current = setInterval(() => {
              const video = videoRef.current;
              if (!video || video.readyState < 2 || ws.readyState !== WebSocket.OPEN) return;
              
              // Verify the video track is enabled and running
              const videoStream = video.srcObject as MediaStream | null;
              const videoTrack = videoStream?.getVideoTracks()[0];
              if (!videoTrack || !videoTrack.enabled || videoTrack.readyState === 'ended') {
                return;
              }

              const canvas = document.createElement('canvas');
              canvas.width = 320;
              canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320) || 240;
              const g = canvas.getContext('2d');
              if (!g) return;
              g.drawImage(video, 0, 0, canvas.width, canvas.height);
              const jpeg = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
              if (jpeg) ws.send(JSON.stringify({ type: 'video_frame', data: jpeg }));
            }, FRAME_INTERVAL_MS);
          }
        };

        const openWs = () => {
          attempt += 1;
          setStatus(attempt === 1 ? 'Connecting to the customer…' : 'Waking things up… the first connection can take up to a minute.');
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
                runningRef.current = true;
                setPhase('live');
                setStatus('');
                startCapture(ws);
                break;
              case 'transcript_interim':
                showCaption('you', msg.text);
                break;
              case 'transcript':
                showCaption('you', msg.text);
                break;
              case 'response_text':
                showCaption('customer', msg.text);
                break;
              case 'audio_out':
                playAudioChunk(msg.data);
                break;
              case 'call_ended':
                // The customer hung up (ran out of patience, or the call wrapped).
                // End & score it — the report explains why they ended it.
                endedRef.current = true; // stop onclose from retrying
                endSession();
                break;
              case 'error':
                setError(msg.message || 'Connection error');
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
              setError('Could not connect. It may be waking up. Please try again in a minute.');
            }
          };
        };

        openWs();
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        setError(msg || (gradeBody ? 'Could not start. Please allow mic & camera access and try again.' : 'Could not start. Please allow microphone access and try again.'));
      }
    }

    boot();
    return () => { disposed = true; cleanup(); };
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

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-black text-white antialiased">
      {/* Sphere */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Hidden self-view — only mounted when grading body language */}
      {gradeBody && <video ref={videoRef} autoPlay playsInline muted className="hidden" />}

      {/* Header */}
      <header className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-6 h-16">
        <div className="text-[13px] font-medium tracking-wide text-white/55 truncate">{config?.scenarioTitle || 'Practice call'}</div>
        <div className="flex items-center gap-2 rounded-full border border-white/12 px-3.5 py-1.5 text-xs text-white/60">
          <span className={`h-1.5 w-1.5 rounded-full ${phase === 'live' ? 'bg-blue-400 animate-pulse' : 'bg-white/40'}`} />
          {phase === 'live' ? <>Live · <span className="tabular-nums">{mm}:{ss}</span></> : phase === 'ending' ? 'Wrapping up' : 'Connecting'}
        </div>
      </header>

      {/* Caption */}
      {caption && (
        <div className="absolute inset-x-0 bottom-28 z-10 mx-auto max-w-[min(680px,86vw)] px-6 text-center">
          <span className="text-[11px] uppercase tracking-[0.15em] text-white/35">{caption.role === 'you' ? 'You' : 'Customer'}</span>
          <p className="mt-1.5 text-[15px] leading-relaxed text-white/80 animate-chip-in">{caption.text}</p>
        </div>
      )}

      {/* Status / errors */}
      {phase === 'connecting' && !error && (
        <div className="absolute inset-x-0 bottom-28 z-10 flex items-center justify-center gap-2 text-sm text-white/55">
          <Loader2 className="h-4 w-4 animate-spin" /> {status}
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 bottom-28 z-10 mx-auto w-fit max-w-[86vw] rounded-xl border border-white/12 bg-black px-4 py-3 text-center text-sm text-white/70">{error}</div>
      )}
      {phase === 'ending' && (
        <div className="absolute inset-x-0 bottom-28 z-10 flex items-center justify-center gap-2 text-sm text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" /> {status}
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-8 inset-x-0 z-10 flex items-center justify-center gap-3">
        {phase === 'live' && (
          <button onClick={toggleMic} title="Toggle mic"
            className={`rounded-full p-4 transition-all active:scale-95 ${micOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-white text-black'}`}>
            {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
        )}
        {(phase === 'live' || error) && (
          <button onClick={endSession} title="End call"
            className="rounded-full bg-white text-black px-6 py-4 flex items-center gap-2 text-sm font-semibold transition-all active:scale-95 hover:opacity-90">
            <PhoneOff className="h-5 w-5" /> End &amp; get feedback
          </button>
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

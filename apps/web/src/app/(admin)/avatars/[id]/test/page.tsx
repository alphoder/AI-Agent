'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

type ConnectionState = 'idle' | 'initializing' | 'connecting' | 'connected' | 'error' | 'ended';

interface TestSession {
  provider: 'heygen';
  sessionToken: string;
  heygenAvatarId: string;
  avatarName: string;
  voiceId: string | null;
  language: string;
  wsUrl: string;
}

/**
 * HeyGen-only avatar test page.
 *
 * Pipeline:
 *   1. POST /api/avatars/:id/test-session → sessionToken + heygenAvatarId + voiceId + wsUrl
 *   2. Initialise HeyGen SDK with sessionToken; avatar video streams via LiveKit into <video>
 *   3. Open WebSocket to our AI service (wsUrl)
 *   4. Capture mic → PCM16 @ 16kHz → stream to AI service
 *   5. AI service runs Deepgram STT + Groq LLM, pushes back response_text events
 *   6. We call avatar.speak({ text, taskType: REPEAT }) — HeyGen renders lip-sync + TTS
 */
export default function AvatarTestPage() {
  const params = useParams();
  const router = useRouter();
  const avatarId = params.id as string;

  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [avatarName, setAvatarName] = useState('Avatar');
  const [elapsed, setElapsed] = useState(0);
  const [userText, setUserText] = useState('');
  const [chatMode, setChatMode] = useState<'voice' | 'text'>('voice');
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  // HeyGen SDK instance — typed loosely because we import it dynamically
  // (avoids SSR issues with the SDK that depends on browser APIs).
  const heygenRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const startTest = useCallback(async () => {
    if (!videoRef.current) return;
    setConnectionState('initializing');
    setError(null);
    setTranscript([]);

    try {
      const res = await apiClient.post(`/avatars/${avatarId}/test-session`);
      const data = res.data.data as TestSession;
      setAvatarName(data.avatarName);

      setConnectionState('connecting');

      // Dynamic import so the SDK doesn't try to run under SSR
      const { default: StreamingAvatar, AvatarQuality, StreamingEvents, TaskType } =
        await import('@heygen/streaming-avatar');

      const avatar = new StreamingAvatar({ token: data.sessionToken });
      heygenRef.current = { avatar, TaskType };

      avatar.on(StreamingEvents.STREAM_READY, (event: { detail: MediaStream }) => {
        if (videoRef.current && event.detail) {
          videoRef.current.srcObject = event.detail;
          videoRef.current.play().catch(() => {});
        }
        setConnectionState('connected');
        timerRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        setConnectionState('ended');
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => setAvatarSpeaking(true));
      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => setAvatarSpeaking(false));

      await avatar.createStartAvatar({
        avatarName: data.heygenAvatarId,
        quality: AvatarQuality.High,
        language: data.language || 'en',
        // Leave voice undefined to use the avatar's default when voiceId is absent
        ...(data.voiceId ? { voice: { voiceId: data.voiceId, rate: 1.0 } } : {}),
      });

      // AI service WebSocket — STT + LLM pipeline
      const ws = new WebSocket(data.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'config', avatar_name: data.avatarName }));
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'listening') {
          // STT ready
        } else if (msg.type === 'transcript_interim') {
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'interim') {
              return [...prev.slice(0, -1), { role: 'interim', text: msg.text }];
            }
            return [...prev, { role: 'interim', text: msg.text }];
          });
        } else if (msg.type === 'transcript') {
          setTranscript((prev) => {
            const filtered = prev.filter((m) => m.role !== 'interim');
            return [...filtered, { role: 'user', text: msg.text }];
          });
        } else if (msg.type === 'response_text') {
          setTranscript((prev) => [...prev, { role: 'assistant', text: msg.text }]);
          // Hand the text to HeyGen — it synthesizes the audio + lip-sync
          // frames internally and streams them over the already-open LiveKit
          // connection. TaskType.REPEAT = no LLM on HeyGen's side.
          try {
            if (heygenRef.current?.avatar) {
              await heygenRef.current.avatar.speak({
                text: msg.text,
                taskType: heygenRef.current.TaskType.REPEAT,
              });
            }
          } catch (speakErr) {
            console.error('HeyGen speak failed:', speakErr);
          }
        } else if (msg.type === 'response_end') {
          // Pipeline finished this turn
        } else if (msg.type === 'error') {
          setTranscript((prev) => [...prev, { role: 'system', text: `Error: ${msg.message}` }]);
        }
      };

      ws.onerror = () => {
        setError('WebSocket connection to AI service failed.');
        setConnectionState('error');
      };

      // Mic capture → PCM16 @ 16kHz → WebSocket to AI service
      if (chatMode === 'voice') {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
        });
        streamRef.current = stream;
        setIsMicOn(true);

        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioCtxRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const pcm16 = float32ToPcm16(float32);
          const b64 = uint8ArrayToBase64(new Uint8Array(pcm16.buffer));
          ws.send(JSON.stringify({ type: 'audio', data: b64 }));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      }
    } catch (err: any) {
      console.error('Test session error:', err);
      setError(err?.response?.data?.error?.message || err?.message || 'Failed to start test session.');
      setConnectionState('error');
    }
  }, [avatarId, chatMode]);

  const stopTest = useCallback(async () => {
    // Stop mic
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsMicOn(false);

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      try { await audioCtxRef.current.close(); } catch { /* ignore */ }
    }
    audioCtxRef.current = null;

    // Close WebSocket
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    // Stop HeyGen session
    if (heygenRef.current?.avatar) {
      try { await heygenRef.current.avatar.stopAvatar(); } catch { /* ignore */ }
      heygenRef.current = null;
    }

    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setElapsed(0);
    setConnectionState('ended');
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      void stopTest();
    };
  }, [stopTest]);

  const sendTextMessage = useCallback(() => {
    const text = userText.trim();
    if (!text) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'text', text }));
    setUserText('');
  }, [userText]);

  const toggleMic = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    const newState = !isMicOn;
    tracks.forEach((t) => { t.enabled = newState; });
    setIsMicOn(newState);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: newState ? 'mic_on' : 'mic_off' }));
    }
  }, [isMicOn]);

  const isLive = connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'initializing';

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0a0a12] text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <button
          onClick={async () => { await stopTest(); router.push('/avatars'); }}
          className="text-sm text-white/60 hover:text-white transition-colors"
        >
          ← Back to avatars
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">{avatarName}</p>
          <p className="text-[11px] text-white/50">HeyGen Interactive Avatar · {formatTime(elapsed)}</p>
        </div>
        <div className="w-24 text-right">
          {connectionState === 'connected' && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 p-4 min-h-0">
        {/* Avatar video */}
        <div className="relative rounded-2xl overflow-hidden bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted={false}
          />
          {connectionState !== 'connected' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              {connectionState === 'idle' && (
                <button
                  onClick={startTest}
                  className="rounded-full bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg"
                >
                  Start training
                </button>
              )}
              {(connectionState === 'initializing' || connectionState === 'connecting') && (
                <div className="text-center space-y-2">
                  <div className="mx-auto w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  <p className="text-sm text-white/70">
                    {connectionState === 'initializing' ? 'Fetching session…' : 'Connecting to HeyGen…'}
                  </p>
                </div>
              )}
              {connectionState === 'error' && (
                <div className="text-center max-w-sm px-6">
                  <p className="text-sm text-rose-400 font-medium">Couldn&apos;t start the session</p>
                  {error && <p className="text-xs text-white/60 mt-2">{error}</p>}
                  <button
                    onClick={() => { setConnectionState('idle'); setError(null); }}
                    className="mt-4 rounded-lg border border-white/20 px-4 py-2 text-xs hover:bg-white/5"
                  >
                    Try again
                  </button>
                </div>
              )}
              {connectionState === 'ended' && (
                <div className="text-center space-y-3">
                  <p className="text-sm text-white/70">Session ended</p>
                  <button
                    onClick={() => { setConnectionState('idle'); }}
                    className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Start a new session
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Speaking indicator */}
          {connectionState === 'connected' && avatarSpeaking && (
            <div className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-black/60 backdrop-blur px-3 py-1.5 text-[11px]">
              <span className="flex gap-0.5">
                <span className="w-0.5 h-2 bg-primary animate-pulse" />
                <span className="w-0.5 h-3 bg-primary animate-pulse [animation-delay:120ms]" />
                <span className="w-0.5 h-2 bg-primary animate-pulse [animation-delay:240ms]" />
              </span>
              Speaking
            </div>
          )}
        </div>

        {/* Transcript + controls */}
        <div className="flex flex-col rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <p className="text-sm font-semibold">Conversation</p>
            <div className="flex gap-1">
              {(['voice', 'text'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setChatMode(m)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                    chatMode === m ? 'bg-primary text-primary-foreground' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {m === 'voice' ? 'Voice' : 'Text'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {transcript.length === 0 ? (
              <p className="text-xs text-white/40 text-center mt-8">
                {connectionState === 'connected'
                  ? chatMode === 'voice' ? 'Say something to begin…' : 'Type a message below.'
                  : 'Start a session to begin the conversation.'}
              </p>
            ) : (
              transcript.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' || m.role === 'interim' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : m.role === 'interim'
                          ? 'bg-white/10 text-white/60 italic'
                          : m.role === 'system'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-white/10 text-white'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>

          <div className="p-3 border-t border-white/10 space-y-2">
            {chatMode === 'text' ? (
              <form
                onSubmit={(e) => { e.preventDefault(); sendTextMessage(); }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={userText}
                  onChange={(e) => setUserText(e.target.value)}
                  placeholder="Say something…"
                  disabled={connectionState !== 'connected'}
                  className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={connectionState !== 'connected' || !userText.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            ) : (
              <button
                onClick={toggleMic}
                disabled={connectionState !== 'connected'}
                className={`w-full rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                  isMicOn
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                {isMicOn ? 'Mute microphone' : 'Unmute microphone'}
              </button>
            )}
            {isLive && (
              <button
                onClick={stopTest}
                className="w-full rounded-lg border border-rose-500/30 text-rose-300 bg-rose-500/10 px-3 py-2 text-xs font-medium hover:bg-rose-500/15 transition-colors"
              >
                End session
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------- audio helpers ---------------------- */

function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

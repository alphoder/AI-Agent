'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { formatTime } from '@/lib/format';
import { LIVEKIT_URL, connectToSession, toggleMicrophone, disconnectFromSession, type SessionEvent } from '@/lib/livekit';
import type { Room } from 'livekit-client';
import { ConnectionState } from 'livekit-client';
import { HelpHint } from '@/components/ui/help-hint';
import VideoPanel from '@/components/session/video-panel';
import TranscriptPanel from '@/components/session/transcript-panel';
import ControlsBar from '@/components/session/controls-bar';
import {
  Mic,
  Volume2,
  Wifi,
  WifiOff,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Shield,
  FileText,
  BarChart3,
  MessageSquare,
  Sparkles,
  RefreshCw,
  PhoneOff,
} from 'lucide-react';

type Phase = 'preflight' | 'session' | 'ending';

// Simli Compose types — dynamically imported
type SimliClientType = import('simli-client').SimliClient;

interface AvatarConfig {
  provider: 'simli' | 'heygen';
  providerAvatarId: string;
  avatarName: string;
  simliApiKey: string;
  wsUrl: string;
}

interface SessionConfig {
  sessionId: string;
  livekitToken: string;
  livekitUrl: string;
  avatarConfig?: AvatarConfig;
  sessionConfig: {
    maxDurationSec: number;
    idleTimeoutSec: number;
    scenarioTitle: string;
    maxTurns: number;
    openingMessage?: string;
  };
}

// Helper: Float32Array to PCM16 Int16Array
function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm16;
}

// Helper: Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface TranscriptEntry {
  role: 'learner' | 'avatar';
  content: string;
  turn_number: number;
  timestamp: number;
}

interface PreflightState {
  mic: 'pending' | 'pass' | 'fail';
  speaker: 'pending' | 'pass' | 'fail';
  network: 'pending' | 'pass' | 'fail';
  browser: 'pending' | 'pass' | 'fail';
}

const PREFLIGHT_ITEMS = [
  { key: 'mic' as const, label: 'Microphone Access', icon: Mic, description: 'Required for voice input' },
  { key: 'speaker' as const, label: 'Audio Output', icon: Volume2, description: 'Required for avatar responses' },
  { key: 'network' as const, label: 'Network Connection', icon: Wifi, description: 'Low-latency connection needed' },
  { key: 'browser' as const, label: 'Browser Compatibility', icon: Globe, description: 'WebRTC support required' },
];

const ENDING_STEPS = [
  { label: 'Processing transcript', icon: FileText },
  { label: 'Evaluating rubric criteria', icon: BarChart3 },
  { label: 'Generating personalized feedback', icon: MessageSquare },
];

function SessionPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assignmentId = searchParams.get('assignment');

  const [phase, setPhase] = useState<Phase>('preflight');
  const [sessionData, setSessionData] = useState<SessionConfig | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [startProgress, setStartProgress] = useState(0);

  // Preflight state
  const [preflight, setPreflight] = useState<PreflightState>({
    mic: 'pending', speaker: 'pending', network: 'pending', browser: 'pending',
  });
  const [micLevel, setMicLevel] = useState(0);

  // Session state
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [interimText, setInterimText] = useState('');
  const [isMicOn, setIsMicOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const [avatarVideoTrack, setAvatarVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [sessionAudioLevel, setSessionAudioLevel] = useState(0);

  // Ending state
  const [endingStep, setEndingStep] = useState(0);

  // Active provider: 'livekit' (default) or 'simli'
  const [activeProvider, setActiveProvider] = useState<'livekit' | 'simli'>('livekit');

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const idleRef = useRef<NodeJS.Timeout | null>(null);
  const audioLevelRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const turnCountRef = useRef(0);

  // Simli-specific refs
  const simliVideoRef = useRef<HTMLVideoElement>(null);
  const simliAudioRef = useRef<HTMLAudioElement>(null);
  const simliClientRef = useRef<SimliClientType | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const simliMicStreamRef = useRef<MediaStream | null>(null);
  const simliAudioContextRef = useRef<AudioContext | null>(null);

  // Preflight checks
  useEffect(() => {
    runPreflightChecks();
  }, []);

  async function runPreflightChecks() {
    // Browser check — WebRTC support
    if (typeof RTCPeerConnection !== 'undefined') {
      setPreflight(p => ({ ...p, browser: 'pass' }));
    } else {
      setPreflight(p => ({ ...p, browser: 'fail' }));
    }

    // Speaker check — we can't truly test without user interaction, auto-pass
    setPreflight(p => ({ ...p, speaker: 'pass' }));

    // Mic check
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPreflight(p => ({ ...p, mic: 'pass' }));

      // Show mic level
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const checkLevel = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(avg / 255);
        requestAnimationFrame(checkLevel);
      };
      checkLevel();
    } catch {
      setPreflight(p => ({ ...p, mic: 'fail' }));
    }

    // Network check — ping API health endpoint instead of raw WebSocket
    try {
      const start = Date.now();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl.replace('/api', '')}/health`, { signal: AbortSignal.timeout(5000) });
      const latency = Date.now() - start;
      if (res.ok && latency < 2000) {
        setPreflight(p => ({ ...p, network: 'pass' }));
      } else {
        setPreflight(p => ({ ...p, network: 'fail' }));
      }
    } catch {
      setPreflight(p => ({ ...p, network: 'fail' }));
    }
  }

  const allPreflightPassed = Object.values(preflight).every(v => v === 'pass');

  // Start Simli Compose connection as fallback when avatarConfig is present
  async function startSimliSession(config: SessionConfig) {
    const avatarConfig = config.avatarConfig!;

    // Dynamic import to avoid SSR issues
    const { SimliClient, generateSimliSessionToken, generateIceServers } = await import('simli-client');

    if (!simliVideoRef.current || !simliAudioRef.current) {
      throw new Error('Simli video/audio elements not ready');
    }

    // Generate Simli session token
    const tokenData = await generateSimliSessionToken({
      apiKey: avatarConfig.simliApiKey,
      config: {
        faceId: avatarConfig.providerAvatarId,
        handleSilence: true,
        maxSessionLength: 1800,
        maxIdleTime: 120,
      },
    });

    // Get ICE servers (optional, works without on localhost)
    let iceServers: RTCIceServer[] | null = null;
    try {
      iceServers = await generateIceServers(avatarConfig.simliApiKey);
    } catch {
      // Proceed without
    }

    // Create SimliClient
    const simliClient = new SimliClient(
      tokenData.session_token,
      simliVideoRef.current,
      simliAudioRef.current,
      iceServers,
    );
    simliClientRef.current = simliClient;

    simliClient.on('start', () => {
      setConnectionStatus('connected');
    });

    simliClient.on('error', (detail: string) => {
      console.error('Simli error:', detail);
      setConnectionStatus('disconnected');
    });

    simliClient.on('speaking', () => setAvatarSpeaking(true));
    simliClient.on('silent', () => setAvatarSpeaking(false));

    await simliClient.start();

    // Connect WebSocket to AI service conversation pipeline
    const ws = new WebSocket(avatarConfig.wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'config',
        avatar_name: avatarConfig.avatarName,
        session_id: config.sessionId,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setIdleSeconds(0); // Reset idle on any WS message

        if (msg.type === 'transcript_interim') {
          setInterimText(msg.text || '');
        } else if (msg.type === 'transcript') {
          // Final user transcript
          if (msg.text?.trim()) {
            turnCountRef.current += 1;
            setTranscripts(prev => [...prev, {
              role: 'learner',
              content: msg.text,
              turn_number: turnCountRef.current,
              timestamp: Date.now(),
            }]);
            setInterimText('');
          }
        } else if (msg.type === 'response_text') {
          // Avatar response text
          turnCountRef.current += 1;
          setTranscripts(prev => [...prev, {
            role: 'avatar',
            content: msg.text,
            turn_number: turnCountRef.current,
            timestamp: Date.now(),
          }]);
          setAvatarSpeaking(true);
        } else if (msg.type === 'audio') {
          // Decode base64 PCM16 and send to SimliClient for lip-sync
          const binaryString = atob(msg.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          if (simliClientRef.current) {
            simliClientRef.current.sendAudioData(bytes);
          }
        } else if (msg.type === 'audio_end') {
          setAvatarSpeaking(false);
        } else if (msg.type === 'session_end') {
          endSession();
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      console.error('WebSocket to AI service failed');
      setConnectionStatus('disconnected');
    };

    ws.onclose = () => {
      // Only mark disconnected if session is still active
      if (phase === 'session') {
        setConnectionStatus('disconnected');
      }
    };

    // Get mic access and stream audio to WebSocket for real-time STT
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
    });
    simliMicStreamRef.current = stream;

    const audioContext = new AudioContext({ sampleRate: 16000 });
    simliAudioContextRef.current = audioContext;
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

    setIsMicOn(true);
    setConnectionStatus('connected');

    // If there's an opening message, add it to transcript
    if (config.sessionConfig.openingMessage) {
      turnCountRef.current += 1;
      setTranscripts(prev => [...prev, {
        role: 'avatar',
        content: config.sessionConfig.openingMessage!,
        turn_number: turnCountRef.current,
        timestamp: Date.now(),
      }]);
    }
  }

  // Cleanup Simli resources
  function cleanupSimli() {
    if (simliClientRef.current) {
      simliClientRef.current.stop();
      simliClientRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (simliMicStreamRef.current) {
      simliMicStreamRef.current.getTracks().forEach(t => t.stop());
      simliMicStreamRef.current = null;
    }
    if (simliAudioContextRef.current) {
      simliAudioContextRef.current.close().catch(() => {});
      simliAudioContextRef.current = null;
    }
    if (simliVideoRef.current) {
      simliVideoRef.current.srcObject = null;
    }
  }

  // Start session
  async function startSession() {
    if (!assignmentId) {
      setError('No assignment ID');
      return;
    }

    // Drive an in-button progress bar so the user has clear feedback while
    // we provision the session, fetch the LiveKit/Simli config, and connect.
    setError('');
    setStarting(true);
    setStartProgress(5);
    const progressTimers: ReturnType<typeof setTimeout>[] = [];
    // Slow march up to 90% — the real work happens in parallel; we cap at 90
    // until the connection actually completes, then jump to 100.
    const steps = [12, 24, 36, 48, 60, 72, 82, 90];
    steps.forEach((p, i) => {
      progressTimers.push(setTimeout(() => setStartProgress(p), 150 + i * 220));
    });

    try {
      const { data } = await apiClient.post('/sessions', { assignment_id: assignmentId });
      const config = data.data as SessionConfig;
      setSessionData(config);
      setPhase('session');
      setConnectionStatus('connecting');

      // Check if avatarConfig is present with Simli provider — use Simli Compose path
      if (config.avatarConfig?.provider === 'simli') {
        setActiveProvider('simli');
        try {
          await startSimliSession(config);
        } catch (simliErr) {
          console.error('Simli connection failed, falling back to LiveKit:', simliErr);
          // Fall back to LiveKit path
          setActiveProvider('livekit');
          await connectLiveKit(config);
        }
      } else {
        // Default: LiveKit path
        setActiveProvider('livekit');
        await connectLiveKit(config);
      }

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);

      // Start idle monitor
      idleRef.current = setInterval(() => {
        setIdleSeconds(s => s + 1);
      }, 1000);

      progressTimers.forEach(clearTimeout);
      setStartProgress(100);
    } catch (err: any) {
      progressTimers.forEach(clearTimeout);
      setStarting(false);
      setStartProgress(0);
      setError(err.response?.data?.error?.message || 'Failed to start session');
    }
  }

  // LiveKit connection (original path)
  async function connectLiveKit(config: SessionConfig) {
    try {
      const room = await connectToSession({
        url: config.livekitUrl || LIVEKIT_URL,
        token: config.livekitToken,
        onVideoTrack: (track) => {
          setAvatarVideoTrack(track);
        },
        onAudioTrack: () => {
          // Audio auto-plays via livekit.ts
        },
        onSessionEvent: (event: SessionEvent) => {
          setIdleSeconds(0); // Reset idle on any event

          switch (event.type) {
            case 'TRANSCRIPT_INTERIM':
              setInterimText(event.text || '');
              break;
            case 'TRANSCRIPT_FINAL':
              if (event.text?.trim()) {
                turnCountRef.current += 1;
                setTranscripts(prev => [...prev, {
                  role: 'learner',
                  content: event.text!,
                  turn_number: turnCountRef.current,
                  timestamp: Date.now(),
                }]);
                setInterimText('');
              }
              break;
            case 'AVATAR_SPEAKING':
              setAvatarSpeaking(true);
              if (event.text?.trim()) {
                turnCountRef.current += 1;
                setTranscripts(prev => [...prev, {
                  role: 'avatar',
                  content: event.text!,
                  turn_number: turnCountRef.current,
                  timestamp: Date.now(),
                }]);
              }
              break;
            case 'AVATAR_IDLE':
              setAvatarSpeaking(false);
              break;
            case 'SESSION_WARNING':
              // Show warning toast handled by idleSeconds
              break;
            case 'SESSION_END':
              endSession();
              break;
            case 'GUARDRAIL_TRIGGERED':
              // Could show a toast here
              break;
          }
        },
        onConnectionStateChange: (state: ConnectionState) => {
          switch (state) {
            case ConnectionState.Connected:
              setConnectionStatus('connected');
              break;
            case ConnectionState.Reconnecting:
              setConnectionStatus('reconnecting');
              break;
            case ConnectionState.Disconnected:
              setConnectionStatus('disconnected');
              break;
            default:
              setConnectionStatus('connecting');
          }
        },
      });

      roomRef.current = room;
      setIsMicOn(true);
      setConnectionStatus('connected');
    } catch (livekitErr) {
      console.error('LiveKit connection failed:', livekitErr);
      // Still allow session to work without LiveKit (demo mode)
      setConnectionStatus('connected');
      setIsMicOn(true);
    }
  }

  // End session
  async function endSession() {
    if (!sessionData) return;
    setPhase('ending');
    setShowEndConfirm(false);
    setEndingStep(0);

    if (timerRef.current) clearInterval(timerRef.current);
    if (idleRef.current) clearInterval(idleRef.current);
    if (audioLevelRef.current) clearInterval(audioLevelRef.current);

    // Disconnect from LiveKit
    if (roomRef.current) {
      disconnectFromSession(roomRef.current);
      roomRef.current = null;
    }

    // Cleanup Simli resources
    cleanupSimli();

    // Animate through ending steps
    const stepTimer = setInterval(() => {
      setEndingStep(s => {
        if (s >= ENDING_STEPS.length - 1) {
          clearInterval(stepTimer);
          return s;
        }
        return s + 1;
      });
    }, 2500);

    // Use AbortController so polling stops if component unmounts (M21 fix)
    const abortController = new AbortController();

    try {
      await apiClient.post(`/sessions/${sessionData.sessionId}/end`);

      // Wait for scoring (up to 15s, then redirect anyway)
      let scored = false;
      for (let i = 0; i < 15; i++) {
        if (abortController.signal.aborted) break;
        await new Promise(r => setTimeout(r, 1000));
        try {
          await apiClient.get(`/sessions/${sessionData.sessionId}/report`);
          scored = true;
          break;
        } catch { /* not ready yet */ }
      }

      clearInterval(stepTimer);

      if (!abortController.signal.aborted) {
        if (scored) {
          router.push(`/reports?session=${sessionData.sessionId}`);
        } else {
          router.push('/dashboard');
        }
      }
    } catch {
      clearInterval(stepTimer);
      if (!abortController.signal.aborted) {
        router.push('/dashboard');
      }
    }

    return () => abortController.abort();
  }

  // Idle warning/end — use ref to avoid stale closure (H19 fix)
  const endSessionRef = useRef(endSession);
  endSessionRef.current = endSession;

  useEffect(() => {
    if (!sessionData) return;
    if (idleSeconds >= sessionData.sessionConfig.idleTimeoutSec) {
      endSessionRef.current();
    }
  }, [idleSeconds, sessionData]);

  // Poll local participant audio level from LiveKit room or Simli mic stream
  useEffect(() => {
    if (phase !== 'session') return;

    audioLevelRef.current = setInterval(() => {
      if (activeProvider === 'livekit') {
        const room = roomRef.current;
        if (room && isMicOn) {
          const level = (room.localParticipant as any).audioLevel ?? 0;
          setSessionAudioLevel(level);
        } else {
          setSessionAudioLevel(0);
        }
      } else {
        // For Simli, just show a basic level based on mic state
        setSessionAudioLevel(isMicOn ? 0.3 : 0);
      }
    }, 50); // ~20fps for smooth visualization

    return () => {
      if (audioLevelRef.current) clearInterval(audioLevelRef.current);
    };
  }, [phase, isMicOn, activeProvider]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Duration warning
  const maxDuration = sessionData?.sessionConfig.maxDurationSec || 600;
  const isNearEnd = elapsed > maxDuration * 0.8;
  const isAlmostOver = elapsed > maxDuration * 0.9;


  // ─────────────────────────────────────────────
  // PREFLIGHT PHASE
  // ─────────────────────────────────────────────
  if (phase === 'preflight') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 flex items-center justify-center p-4">
        {/* Subtle background pattern */}
        <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }} />

        <div className="relative w-full max-w-lg">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  <Shield className="w-4 h-4" />
                </div>
                <h1 className="text-lg font-semibold">Pre-Session Check</h1>
              </div>
              <p className="text-blue-100 text-sm mt-2">
                Verifying your setup before the training begins
              </p>
            </div>

            {/* Scenario info */}
            <div className="px-8 py-4 bg-slate-50/80 border-b border-slate-100">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Scenario</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">
                {searchParams.get('scenario') || 'Training Session'}
              </p>
              {searchParams.get('persona') && (
                <>
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-2">Speaking with</p>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">
                    {searchParams.get('persona')}
                  </p>
                </>
              )}
            </div>

            {/* Help hint */}
            <div className="px-8 pt-5 pb-0">
              <HelpHint variant="info" dismissible dismissKey="session-preflight-tip" title="Before you begin">
                Make sure your microphone and speakers are working. The avatar will speak to you and listen to your responses in real-time. Use headphones for the best experience and find a quiet space.
              </HelpHint>
            </div>

            {/* Check items */}
            <div className="px-8 py-6 space-y-3">
              {PREFLIGHT_ITEMS.map(({ key, label, icon: Icon, description }) => {
                const status = preflight[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all duration-300 ${
                      status === 'pass'
                        ? 'bg-emerald-50/50 border-emerald-200/60'
                        : status === 'fail'
                        ? 'bg-red-50/50 border-red-200/60'
                        : 'bg-slate-50/50 border-slate-200/60'
                    }`}
                  >
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-300 ${
                      status === 'pass'
                        ? 'bg-emerald-100 text-emerald-600'
                        : status === 'fail'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-slate-100 text-slate-400'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{label}</p>
                      <p className="text-xs text-slate-400">{description}</p>
                    </div>

                    {/* Status indicator */}
                    <div className="shrink-0">
                      {status === 'pending' && (
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                      )}
                      {status === 'pass' && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      )}
                      {status === 'fail' && (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Mic level visualizer */}
              {preflight.mic === 'pass' && (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-500">Microphone Level</p>
                    <p className="text-xs text-slate-400">Speak to test</p>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
                    <div
                      className="h-full rounded-full transition-all duration-75 ease-out"
                      style={{
                        width: `${Math.max(micLevel * 100, 2)}%`,
                        background: `linear-gradient(90deg, #10b981, #34d399 ${Math.min(micLevel * 100, 60)}%, #fbbf24 80%, #ef4444 100%)`,
                      }}
                    />
                    {/* Level marks */}
                    <div className="absolute inset-0 flex items-center">
                      {[25, 50, 75].map(mark => (
                        <div
                          key={mark}
                          className="absolute top-0 bottom-0 w-px bg-slate-200/60"
                          style={{ left: `${mark}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Error display */}
            {error && (
              <div className="mx-8 mb-4 p-3 rounded-xl bg-red-50 border border-red-200/60 text-red-700 text-sm flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Start button (doubles as progress bar while connecting) */}
            <div className="px-8 pb-8">
              <button
                onClick={startSession}
                disabled={!allPreflightPassed || starting}
                className={`relative w-full overflow-hidden flex items-center justify-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200 ${
                  starting
                    ? 'bg-slate-100 text-white shadow-lg shadow-blue-500/25 cursor-wait'
                    : allPreflightPassed
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:brightness-110 active:scale-[0.98]'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {/* Progress fill — slides left→right inside the button */}
                {starting && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-indigo-600 transition-[width] duration-500 ease-out"
                    style={{ width: `${startProgress}%` }}
                  />
                )}

                <span className="relative z-10 flex items-center gap-2.5">
                  {starting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        {startProgress < 25
                          ? 'Connecting to AI service'
                          : startProgress < 50
                          ? 'Loading persona & voice'
                          : startProgress < 80
                          ? 'Establishing live audio'
                          : startProgress < 100
                          ? 'Almost ready'
                          : 'Ready'}
                      </span>
                      <span className="ml-1 font-mono tabular-nums text-white/90">
                        {startProgress}%
                      </span>
                    </>
                  ) : allPreflightPassed ? (
                    <>
                      <Play className="w-4 h-4" />
                      Start Training
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Waiting for checks...
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-slate-400 mt-4">
            Your camera and microphone will be used during the session
          </p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // ENDING PHASE
  // ─────────────────────────────────────────────
  if (phase === 'ending') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-800/60 p-8 shadow-2xl">
            {/* Animated icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-blue-400" />
                </div>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 animate-pulse" />
              </div>
            </div>

            <h2 className="text-lg font-semibold text-white text-center mb-1">
              Analyzing Your Performance
            </h2>
            <p className="text-sm text-gray-400 text-center mb-8">
              This will only take a moment
            </p>

            {/* Steps */}
            <div className="space-y-4">
              {ENDING_STEPS.map((step, i) => {
                const isActive = i === endingStep;
                const isDone = i < endingStep;
                const StepIcon = step.icon;

                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-500 ${
                      isActive
                        ? 'bg-blue-500/10 border border-blue-500/20'
                        : isDone
                        ? 'bg-emerald-500/5 border border-emerald-500/10'
                        : 'border border-transparent opacity-40'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-500 ${
                      isActive
                        ? 'bg-blue-500/20 text-blue-400'
                        : isDone
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-gray-800 text-gray-600'
                    }`}>
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : isActive ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <StepIcon className="w-4 h-4" />
                      )}
                    </div>
                    <span className={`text-sm font-medium transition-colors duration-500 ${
                      isActive ? 'text-blue-300' : isDone ? 'text-emerald-400' : 'text-gray-600'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="mt-8 h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${((endingStep + 1) / ENDING_STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // SESSION PHASE
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800/50">
        {/* Left: Scenario title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-sm font-medium text-gray-200 truncate">
            {sessionData?.sessionConfig.scenarioTitle || 'Training Session'}
          </span>
        </div>

        {/* Center: Connection status */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-800/60">
          <div className={`w-2 h-2 rounded-full transition-colors ${
            connectionStatus === 'connected'
              ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
              : connectionStatus === 'reconnecting'
              ? 'bg-amber-400 shadow-sm shadow-amber-400/50 animate-pulse'
              : 'bg-red-400 shadow-sm shadow-red-400/50'
          }`} />
          <span className="text-xs text-gray-400 capitalize">{connectionStatus}</span>
        </div>

        {/* Right: Timer */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className={`text-sm font-mono tabular-nums px-3 py-1 rounded-lg transition-colors ${
            isAlmostOver
              ? 'bg-red-500/10 text-red-400'
              : isNearEnd
              ? 'bg-amber-500/10 text-amber-400'
              : 'text-gray-400'
          }`}>
            {formatTime(elapsed)} / {formatTime(maxDuration)}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4 relative">
        {/* Avatar video — Simli Compose mode */}
        {activeProvider === 'simli' ? (
          <div className="w-full max-w-2xl relative group">
            {/* Glow ring when speaking */}
            {avatarSpeaking && (
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-blue-500/20 rounded-[20px] blur-md animate-pulse" />
            )}
            <div
              className={`relative w-full aspect-video rounded-2xl overflow-hidden transition-all duration-300 ${
                avatarSpeaking
                  ? 'ring-2 ring-blue-500/40 ring-offset-2 ring-offset-gray-950'
                  : 'ring-1 ring-gray-800'
              }`}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-850 to-gray-900" />
              <video
                ref={simliVideoRef}
                autoPlay
                playsInline
                className={`relative w-full h-full object-cover ${connectionStatus === 'connected' ? '' : 'hidden'}`}
              />
              <audio ref={simliAudioRef} autoPlay className="hidden" />

              {connectionStatus !== 'connected' && (
                <div className="relative inset-0 flex flex-col items-center justify-center w-full h-full gap-3">
                  <div className="w-20 h-20 rounded-full bg-gray-700/50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                  </div>
                  <p className="text-sm text-gray-400 font-medium">Connecting to avatar...</p>
                </div>
              )}

              {/* Speaking indicator */}
              {avatarSpeaking && (
                <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
                  <div className="flex items-end gap-[3px] h-3.5">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="w-[3px] bg-blue-400 rounded-full animate-session-eq-bar"
                        style={{
                          animationDelay: `${i * 120}ms`,
                          animationDuration: '0.8s',
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-blue-300 font-medium">Speaking</span>
                </div>
              )}

              {/* Vignette */}
              <div className="absolute inset-0 pointer-events-none rounded-2xl" style={{
                background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.3) 100%)',
              }} />
            </div>
          </div>
        ) : (
          /* Avatar video — LiveKit mode */
          <VideoPanel
            videoTrack={avatarVideoTrack}
            avatarSpeaking={avatarSpeaking}
            connectionStatus={connectionStatus}
          />
        )}

        {/* Transcript */}
        <TranscriptPanel
          transcripts={transcripts}
          interimText={interimText}
        />
        <div ref={transcriptEndRef} />
      </div>

      {/* Reconnection / Disconnected overlay */}
      {connectionStatus === 'reconnecting' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-session-fade-in">
          <div className="flex flex-col items-center gap-4 p-8 bg-gray-900/90 border border-gray-700/60 rounded-2xl shadow-2xl max-w-sm w-full mx-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Reconnecting...</h2>
              <p className="text-sm text-gray-400">
                Please wait, your session is being restored
              </p>
            </div>
          </div>
        </div>
      )}

      {connectionStatus === 'disconnected' && phase === 'session' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/95 animate-session-fade-in">
          <div className="flex flex-col items-center gap-5 p-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl max-w-sm w-full mx-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <WifiOff className="w-7 h-7 text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white mb-1">Connection Lost</h2>
              <p className="text-sm text-gray-400">
                Unable to reach the server. Check your internet connection.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={endSession}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-700 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <PhoneOff className="w-4 h-4" />
                End Session
              </button>
              <button
                onClick={async () => {
                  setConnectionStatus('reconnecting');
                  try {
                    if (activeProvider === 'simli' && sessionData?.avatarConfig) {
                      // Cleanup old Simli resources and reconnect
                      cleanupSimli();
                      await startSimliSession(sessionData);
                    } else if (roomRef.current) {
                      // Attempt to reconnect the existing LiveKit room
                      await roomRef.current.connect(
                        sessionData?.livekitUrl || LIVEKIT_URL,
                        sessionData?.livekitToken || '',
                      );
                      setConnectionStatus('connected');
                    }
                  } catch {
                    setConnectionStatus('disconnected');
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-medium text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Reconnecting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Idle warning toast */}
      {idleSeconds >= 45 && idleSeconds < 60 && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 animate-session-toast-in">
          <div className="flex items-center gap-3 bg-amber-500/95 backdrop-blur-sm text-black pl-4 pr-5 py-2.5 rounded-xl shadow-lg shadow-amber-500/20">
            <div className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold">{60 - idleSeconds}</span>
            </div>
            <span className="text-sm font-medium">Session will end due to inactivity</span>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <ControlsBar
        isMicOn={isMicOn}
        elapsed={elapsed}
        maxDuration={maxDuration}
        audioLevel={sessionAudioLevel}
        onToggleMic={async () => {
          const newState = !isMicOn;
          setIsMicOn(newState);
          setIdleSeconds(0);
          if (activeProvider === 'simli') {
            // Toggle mic track enabled state for Simli WebSocket streaming
            if (simliMicStreamRef.current) {
              const track = simliMicStreamRef.current.getAudioTracks()[0];
              if (track) {
                track.enabled = newState;
                wsRef.current?.send(JSON.stringify({ type: newState ? 'mic_on' : 'mic_off' }));
              }
            }
          } else if (roomRef.current) {
            await toggleMicrophone(roomRef.current, newState);
          }
        }}
        onEndSession={() => setShowEndConfirm(true)}
      />

      {/* End confirmation modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-session-fade-in">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl animate-session-scale-in">
            <h2 className="text-lg font-semibold text-white mb-2">End Session?</h2>
            <p className="text-sm text-gray-400 mb-6">
              Your conversation will be analyzed and scored. You can review your performance in the reports section.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-gray-700 rounded-xl text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Continue Session
              </button>
              <button
                onClick={endSession}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-medium text-white transition-colors"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionLoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <p className="text-sm text-gray-400">Loading session...</p>
      </div>
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<SessionLoadingFallback />}>
      <SessionPageInner />
    </Suspense>
  );
}

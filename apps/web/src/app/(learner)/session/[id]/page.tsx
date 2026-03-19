'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { LIVEKIT_URL, connectToSession, toggleMicrophone, disconnectFromSession, type SessionEvent } from '@/lib/livekit';
import type { Room } from 'livekit-client';
import { ConnectionState } from 'livekit-client';
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

interface SessionConfig {
  sessionId: string;
  livekitToken: string;
  livekitUrl: string;
  sessionConfig: {
    maxDurationSec: number;
    idleTimeoutSec: number;
    scenarioTitle: string;
    maxTurns: number;
  };
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

export default function SessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const assignmentId = searchParams.get('assignment');

  const [phase, setPhase] = useState<Phase>('preflight');
  const [sessionData, setSessionData] = useState<SessionConfig | null>(null);
  const [error, setError] = useState('');

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

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const idleRef = useRef<NodeJS.Timeout | null>(null);
  const audioLevelRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const turnCountRef = useRef(0);

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

  // Start session
  async function startSession() {
    if (!assignmentId) {
      setError('No assignment ID');
      return;
    }

    try {
      const { data } = await apiClient.post('/sessions', { assignment_id: assignmentId });
      const config = data.data as SessionConfig;
      setSessionData(config);
      setPhase('session');
      setConnectionStatus('connecting');

      // Connect to LiveKit room
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

      // Start timer
      timerRef.current = setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);

      // Start idle monitor
      idleRef.current = setInterval(() => {
        setIdleSeconds(s => s + 1);
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to start session');
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

    try {
      await apiClient.post(`/sessions/${sessionData.sessionId}/end`);

      // Wait for scoring (up to 15s, then redirect anyway)
      let scored = false;
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
          await apiClient.get(`/sessions/${sessionData.sessionId}/report`);
          scored = true;
          break;
        } catch { /* not ready yet */ }
      }

      clearInterval(stepTimer);

      if (scored) {
        router.push(`/reports?session=${sessionData.sessionId}`);
      } else {
        router.push('/dashboard');
      }
    } catch {
      clearInterval(stepTimer);
      router.push('/dashboard');
    }
  }

  // Idle warning/end
  useEffect(() => {
    if (!sessionData) return;
    if (idleSeconds >= sessionData.sessionConfig.idleTimeoutSec) {
      endSession();
    }
  }, [idleSeconds]);

  // Poll local participant audio level from LiveKit room
  useEffect(() => {
    if (phase !== 'session') return;

    audioLevelRef.current = setInterval(() => {
      const room = roomRef.current;
      if (room && isMicOn) {
        // LiveKit exposes audioLevel on LocalParticipant (0-1)
        const level = (room.localParticipant as any).audioLevel ?? 0;
        setSessionAudioLevel(level);
      } else {
        setSessionAudioLevel(0);
      }
    }, 50); // ~20fps for smooth visualization

    return () => {
      if (audioLevelRef.current) clearInterval(audioLevelRef.current);
    };
  }, [phase, isMicOn]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Duration warning
  const maxDuration = sessionData?.sessionConfig.maxDurationSec || 600;
  const isNearEnd = elapsed > maxDuration * 0.8;
  const isAlmostOver = elapsed > maxDuration * 0.9;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

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

            {/* Start button */}
            <div className="px-8 pb-8">
              <button
                onClick={startSession}
                disabled={!allPreflightPassed}
                className={`w-full flex items-center justify-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200 ${
                  allPreflightPassed
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:brightness-110 active:scale-[0.98]'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {allPreflightPassed ? (
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
        {/* Avatar video */}
        <VideoPanel
          videoTrack={avatarVideoTrack}
          avatarSpeaking={avatarSpeaking}
          connectionStatus={connectionStatus}
        />

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
                    if (roomRef.current) {
                      // Attempt to reconnect the existing room
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
          if (roomRef.current) {
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

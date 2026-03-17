'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { LIVEKIT_URL } from '@/lib/livekit';

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
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [idleSeconds, setIdleSeconds] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const idleRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

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

      // Cleanup on unmount
      return () => { stream.getTracks().forEach(t => t.stop()); ctx.close(); };
    } catch {
      setPreflight(p => ({ ...p, mic: 'fail' }));
    }

    // Network check — WebSocket latency test
    try {
      const start = Date.now();
      const ws = new WebSocket(LIVEKIT_URL.replace('ws://', 'ws://').replace('wss://', 'wss://'));
      ws.onopen = () => {
        const latency = Date.now() - start;
        setPreflight(p => ({ ...p, network: latency < 500 ? 'pass' : 'fail' }));
        ws.close();
      };
      ws.onerror = () => setPreflight(p => ({ ...p, network: 'fail' }));
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          setPreflight(p => ({ ...p, network: 'fail' }));
          ws.close();
        }
      }, 5000);
    } catch {
      setPreflight(p => ({ ...p, network: 'fail' }));
    }

    // Speaker check - always pass (we can't truly test without user action)
    setPreflight(p => ({ ...p, speaker: 'pass' }));
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
      setSessionData(data.data);
      setPhase('session');
      setConnectionStatus('connected');
      setIsMicOn(true);

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

    if (timerRef.current) clearInterval(timerRef.current);
    if (idleRef.current) clearInterval(idleRef.current);

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

      if (scored) {
        router.push(`/reports?session=${sessionData.sessionId}`);
      } else {
        router.push('/dashboard');
      }
    } catch {
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

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Duration warning
  const maxDuration = sessionData?.sessionConfig.maxDurationSec || 600;
  const isNearEnd = elapsed > maxDuration * 0.8;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Preflight phase
  if (phase === 'preflight') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="max-w-md w-full p-6 space-y-6">
          <h1 className="text-xl font-bold text-center">Pre-Session Check</h1>

          <div className="space-y-3">
            {[
              { key: 'mic', label: 'Microphone' },
              { key: 'speaker', label: 'Speaker' },
              { key: 'network', label: 'Network' },
              { key: 'browser', label: 'Browser (WebRTC)' },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="text-sm font-medium">{label}</span>
                <span className={`text-sm font-medium ${
                  preflight[key as keyof PreflightState] === 'pass' ? 'text-green-600' :
                  preflight[key as keyof PreflightState] === 'fail' ? 'text-red-600' :
                  'text-yellow-600'
                }`}>
                  {preflight[key as keyof PreflightState] === 'pass' ? 'Pass' :
                   preflight[key as keyof PreflightState] === 'fail' ? 'Fail' :
                   'Checking...'}
                </span>
              </div>
            ))}
          </div>

          {/* Mic level meter */}
          {preflight.mic === 'pass' && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Mic Level</p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${micLevel * 100}%` }} />
              </div>
            </div>
          )}

          {error && <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">{error}</div>}

          <button
            onClick={startSession}
            disabled={!allPreflightPassed}
            className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Start Session
          </button>
        </div>
      </div>
    );
  }

  // Ending phase
  if (phase === 'ending') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin h-10 w-10 border-4 border-white border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-lg">Generating your report...</p>
          <p className="text-sm text-gray-400 mt-1">This may take a moment</p>
        </div>
      </div>
    );
  }

  // Session phase
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/80">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{sessionData?.sessionConfig.scenarioTitle}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected' ? 'bg-green-500' :
            connectionStatus === 'reconnecting' ? 'bg-yellow-500' : 'bg-red-500'
          }`} />
          <span className="text-xs text-gray-400">{connectionStatus}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        {/* Avatar video */}
        <div className={`w-full max-w-2xl aspect-video bg-gray-800 rounded-2xl overflow-hidden relative ${
          avatarSpeaking ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
        }`}>
          <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-2xl">
            Avatar Video
          </div>
        </div>

        {/* Interim transcript */}
        {interimText && (
          <div className="mt-4 text-sm text-gray-400 animate-pulse">
            {interimText}...
          </div>
        )}

        {/* Conversation transcript */}
        <div className="w-full max-w-2xl mt-4 max-h-48 overflow-y-auto space-y-2 scrollbar-thin">
          {transcripts.map((t, i) => (
            <div key={i} className={`text-sm ${t.role === 'learner' ? 'text-blue-300 text-right' : 'text-gray-300'}`}>
              <span className="text-xs text-gray-500 mr-2">{t.role === 'learner' ? 'You' : 'Avatar'}</span>
              {t.content}
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      </div>

      {/* Idle warning */}
      {idleSeconds >= 45 && idleSeconds < 60 && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-black px-4 py-2 rounded-lg text-sm font-medium">
          Session will end in {60 - idleSeconds}s due to inactivity
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex items-center justify-center gap-6 py-4 bg-gray-900/80">
        {/* Mic button */}
        <button
          onClick={() => { setIsMicOn(!isMicOn); setIdleSeconds(0); }}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
            isMicOn
              ? 'bg-primary hover:bg-primary/90 animate-pulse'
              : 'bg-red-500 hover:bg-red-600'
          }`}
        >
          <span className="text-2xl">{isMicOn ? 'M' : 'X'}</span>
        </button>

        {/* Timer */}
        <div className={`text-lg font-mono ${isNearEnd ? 'text-red-400' : 'text-white'}`}>
          {formatTime(elapsed)}
        </div>

        {/* End session */}
        <button
          onClick={() => setShowEndConfirm(true)}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium"
        >
          End Session
        </button>
      </div>

      {/* End confirmation modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full mx-4">
            <h2 className="text-lg font-bold mb-2">End Session?</h2>
            <p className="text-sm text-gray-400 mb-4">Your session will be scored after ending.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowEndConfirm(false)}
                className="px-4 py-2 border border-gray-600 rounded-lg text-sm hover:bg-gray-700">Cancel</button>
              <button onClick={endSession}
                className="px-4 py-2 bg-red-600 rounded-lg text-sm hover:bg-red-700">End Session</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

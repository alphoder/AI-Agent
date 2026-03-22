'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SimliClient, generateSimliSessionToken, generateIceServers } from 'simli-client';
import apiClient from '@/lib/api-client';

type ConnectionState = 'idle' | 'initializing' | 'connecting' | 'connected' | 'error' | 'ended';

export default function AvatarTestPage() {
  const params = useParams();
  const router = useRouter();
  const avatarId = params.id as string;

  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [avatarName, setAvatarName] = useState('Avatar');
  const [elapsed, setElapsed] = useState(0);
  const [userText, setUserText] = useState('');
  const [chatMode, setChatMode] = useState<'voice' | 'text'>('voice');
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([]);
  const [provider, setProvider] = useState<'simli' | 'heygen'>('simli');

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const simliClientRef = useRef<SimliClient | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const startTest = useCallback(async () => {
    if (!videoRef.current || !audioRef.current) return;
    setConnectionState('initializing');
    setError(null);
    setTranscript([]);

    try {
      // Get session config from API
      const res = await apiClient.post(`/avatars/${avatarId}/test-session`);
      const data = res.data.data;
      setAvatarName(data.avatarName);
      setProvider(data.provider);

      if (data.provider === 'simli') {
        setConnectionState('connecting');

        // Generate Simli session token
        const tokenData = await generateSimliSessionToken({
          apiKey: data.simliApiKey,
          config: {
            faceId: data.faceId,
            handleSilence: true,
            maxSessionLength: 300,
            maxIdleTime: 120,
          },
        });

        // Get ICE servers
        let iceServers: RTCIceServer[] | null = null;
        try {
          iceServers = await generateIceServers(data.simliApiKey);
        } catch {
          // Proceed without — works on localhost
        }

        // Create SimliClient
        const simliClient = new SimliClient(
          tokenData.session_token,
          videoRef.current,
          audioRef.current,
          iceServers,
        );
        simliClientRef.current = simliClient;

        simliClient.on('start', () => {
          setConnectionState('connected');
        });

        simliClient.on('error', (detail) => {
          setError(detail || 'Simli connection failed');
          setConnectionState('error');
        });

        simliClient.on('speaking', () => setAvatarSpeaking(true));
        simliClient.on('silent', () => setAvatarSpeaking(false));

        await simliClient.start();

        // Connect WebSocket to AI service for conversation pipeline
        const ws = new WebSocket(data.wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: 'config',
            avatar_name: data.avatarName,
          }));
        };

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);

          if (msg.type === 'transcript') {
            setTranscript(prev => [...prev, { role: 'user', text: msg.text }]);
          } else if (msg.type === 'response_text') {
            setTranscript(prev => [...prev, { role: 'assistant', text: msg.text }]);
            setAvatarSpeaking(true);
          } else if (msg.type === 'audio') {
            // Decode base64 PCM16 and send to SimliClient
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
          } else if (msg.type === 'error') {
            setTranscript(prev => [...prev, { role: 'system', text: `Error: ${msg.message}` }]);
          }
        };

        ws.onerror = () => {
          setError('WebSocket connection to AI service failed. Is the AI service running on port 8000?');
          setConnectionState('error');
        };

        // Get mic access for voice mode
        if (chatMode === 'voice') {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
          });
          streamRef.current = stream;
          setIsMicOn(true);
        }

        setConnectionState('connected');
        timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);

      } else {
        // HeyGen path — import dynamically to avoid SSR issues
        const { default: StreamingAvatar, AvatarQuality, StreamingEvents, TaskType } =
          await import('@heygen/streaming-avatar');

        setConnectionState('connecting');

        const avatar = new StreamingAvatar({ token: data.sessionToken });

        avatar.on(StreamingEvents.STREAM_READY, (event: { detail: MediaStream }) => {
          if (videoRef.current && event.detail) {
            videoRef.current.srcObject = event.detail;
            videoRef.current.play().catch(() => {});
          }
          setConnectionState('connected');
          timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
        });

        avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
          setConnectionState('ended');
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        });

        avatar.on(StreamingEvents.AVATAR_START_TALKING, () => setAvatarSpeaking(true));
        avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => setAvatarSpeaking(false));

        await avatar.createStartAvatar({
          avatarName: data.heygenAvatarId,
          quality: AvatarQuality.Medium,
          language: 'en',
        });

        if (chatMode === 'voice') {
          await avatar.startVoiceChat({});
        }
      }

    } catch (err: unknown) {
      console.error('Test session error:', err);
      const message = err instanceof Error ? err.message : 'Failed to start test session';
      setError(message);
      setConnectionState('error');
    }
  }, [avatarId, chatMode]);

  // Push-to-talk: start recording
  const startRecording = useCallback(() => {
    if (!streamRef.current || !wsRef.current) return;
    setIsRecording(true);
    audioChunksRef.current = [];

    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm;codecs=opus' });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      // Convert to PCM16 via AudioContext
      const arrayBuffer = await blob.arrayBuffer();
      const audioContext = new AudioContext({ sampleRate: 16000 });
      try {
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        const pcm16 = float32ToPcm16(audioBuffer.getChannelData(0));
        const base64 = uint8ArrayToBase64(new Uint8Array(pcm16.buffer));

        wsRef.current?.send(JSON.stringify({ type: 'audio_complete', data: base64 }));
      } catch (e) {
        console.error('Audio decode error:', e);
      } finally {
        await audioContext.close();
      }
    };

    mediaRecorder.start(100);
  }, []);

  // Push-to-talk: stop recording
  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const sendTextMessage = useCallback(() => {
    if (!userText.trim()) return;
    const text = userText.trim();
    setUserText('');

    if (provider === 'simli' && wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'text', text }));
    }
  }, [userText, provider]);

  const endTest = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (simliClientRef.current) { simliClientRef.current.stop(); simliClientRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (mediaRecorderRef.current?.state === 'recording') { mediaRecorderRef.current.stop(); }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setConnectionState('ended');
    setIsRecording(false);
    setIsMicOn(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (simliClientRef.current) simliClientRef.current.stop();
      if (wsRef.current) wsRef.current.close();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-black/80 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { endTest(); router.push(`/avatars/${avatarId}`); }}
            className="text-white/70 hover:text-white text-sm flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <span className="text-white font-medium">{avatarName} — Test Session</span>
          {provider === 'simli' && <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">Simli</span>}
          {provider === 'heygen' && <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded">HeyGen</span>}
        </div>
        <div className="flex items-center gap-4">
          {connectionState === 'connected' && (
            <>
              {avatarSpeaking && (
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="w-1 bg-blue-400 rounded-full animate-pulse" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="text-blue-400 text-xs">Speaking</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-xs">Connected</span>
              </div>
              <span className="text-white/60 text-sm font-mono">{formatTime(elapsed)}</span>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Video area */}
        <div className="flex-1 flex items-start justify-center pt-4">
          <video ref={videoRef} autoPlay playsInline className={`h-full max-w-full object-contain rounded-lg ${connectionState === 'connected' ? '' : 'hidden'}`} />
          <audio ref={audioRef} autoPlay className="hidden" />

          {/* Idle state */}
          {connectionState === 'idle' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-6">
                <div className="w-32 h-32 rounded-full bg-white/10 flex items-center justify-center mx-auto">
                  <svg className="w-16 h-16 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-white text-xl font-semibold">Test {avatarName}</h2>
                  <p className="text-white/50 mt-1 text-sm">Talk to the avatar. Hold the mic button to speak.</p>
                  <p className="text-white/30 mt-1 text-xs">Pipeline: Your voice → Whisper STT → GPT-4o → TTS → Simli lip-sync</p>
                </div>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => { setChatMode('voice'); startTest(); }}
                    className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-lg font-medium text-sm flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Voice Chat
                  </button>
                  <button onClick={() => { setChatMode('text'); startTest(); }}
                    className="border border-white/20 text-white/70 hover:text-white px-6 py-3 rounded-lg text-sm flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Text Chat
                  </button>
                </div>
              </div>
            </div>
          )}

          {(connectionState === 'initializing' || connectionState === 'connecting') && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-12 h-12 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                <p className="text-white/70 text-sm">{connectionState === 'initializing' ? 'Setting up...' : 'Connecting to avatar...'}</p>
              </div>
            </div>
          )}

          {connectionState === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-md">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-white font-medium">Connection Failed</h3>
                <p className="text-white/50 text-sm">{error}</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => { setConnectionState('idle'); setError(null); }}
                    className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg text-sm">Try Again</button>
                  <button onClick={() => router.push(`/avatars/${avatarId}`)}
                    className="border border-white/20 text-white/70 px-6 py-2 rounded-lg text-sm">Go Back</button>
                </div>
              </div>
            </div>
          )}

          {connectionState === 'ended' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-white font-medium">Test Complete</h3>
                <p className="text-white/50 text-sm">Session lasted {formatTime(elapsed)}</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => { setConnectionState('idle'); setElapsed(0); setTranscript([]); }}
                    className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-lg text-sm">Test Again</button>
                  <button onClick={() => router.push(`/avatars/${avatarId}`)}
                    className="border border-white/20 text-white/70 px-6 py-2 rounded-lg text-sm">Back to Avatar</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transcript panel — right side when connected */}
        {connectionState === 'connected' && transcript.length > 0 && (
          <div className="w-80 bg-black/60 border-l border-white/10 flex flex-col">
            <div className="px-4 py-3 border-b border-white/10">
              <span className="text-white/70 text-xs font-medium uppercase tracking-wide">Transcript</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {transcript.map((msg, i) => (
                <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-right' : ''}`}>
                  <span className={`inline-block px-3 py-1.5 rounded-lg max-w-[90%] ${
                    msg.role === 'user' ? 'bg-primary/30 text-white' :
                    msg.role === 'system' ? 'bg-red-500/20 text-red-300' :
                    'bg-white/10 text-white/80'
                  }`}>
                    {msg.text}
                  </span>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {connectionState === 'connected' && (
        <div className="px-6 py-4 bg-black/80 border-t border-white/10">
          {chatMode === 'text' && (
            <div className="flex gap-2 mb-3 max-w-2xl mx-auto">
              <input type="text" value={userText} onChange={(e) => setUserText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendTextMessage()}
                placeholder="Type a message..."
                className="flex-1 bg-white/10 text-white placeholder-white/40 rounded-lg px-4 py-2 text-sm border border-white/10 focus:border-primary/50 focus:outline-none" />
              <button onClick={sendTextMessage} disabled={!userText.trim()}
                className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50">Send</button>
            </div>
          )}

          <div className="flex items-center justify-center gap-6">
            {/* Push-to-talk mic button (voice mode) */}
            {chatMode === 'voice' && (
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all select-none ${
                  isRecording
                    ? 'bg-red-500 scale-110 ring-4 ring-red-500/30 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}

            {isRecording && (
              <span className="text-red-400 text-xs animate-pulse">Recording...</span>
            )}

            {/* End call */}
            <button onClick={endTest}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
            </button>

            {/* Switch mode */}
            <button onClick={() => setChatMode(chatMode === 'voice' ? 'text' : 'voice')}
              className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              title={chatMode === 'voice' ? 'Switch to text' : 'Switch to voice'}>
              {chatMode === 'voice' ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
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

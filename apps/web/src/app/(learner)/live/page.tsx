'use client';

import { useState, useEffect, useRef } from 'react';
import { AudioLines, Play, Square, RotateCcw, AlertTriangle, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Accent } from '@/components/ui/accent';

const FILLER_WORDS = ['um', 'uh', 'like', 'so', 'basically', 'actually', 'you know'];

export default function LiveRoomPage() {
  const [active, setActive] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [interimText, setInterimText] = useState('');
  
  // Analytics metrics
  const [wpm, setWpm] = useState(0);
  const [fillerCounts, setFillerCounts] = useState<Record<string, number>>({
    like: 0,
    um: 0,
    uh: 0,
    so: 0,
    basically: 0,
    actually: 0,
    'you know': 0,
  });
  const [totalWords, setTotalWords] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [unsupported, setUnsupported] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Initialize Speech Recognition
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setUnsupported(true);
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (e: any) => {
      let finalStr = '';
      let interimStr = '';

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          finalStr += res[0].transcript + ' ';
        } else {
          interimStr += res[0].transcript;
        }
      }

      if (interimStr) {
        setInterimText(interimStr);
      }

      if (finalStr) {
        setInterimText('');
        setTranscript((prev) => [...prev, finalStr.trim()]);
        processWords(finalStr);
      }
    };

    rec.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
    };

    rec.onend = () => {
      // Auto restart if still marked active
      if (active) {
        try { rec.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = rec;

    return () => {
      try { rec.stop(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Audio Canvas Wave Visualizer
  async function startVisualizer(stream: MediaStream) {
    if (typeof window === 'undefined') return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const draw = () => {
        if (!analyserRef.current) return;
        animationFrameRef.current = requestAnimationFrame(draw);

        analyserRef.current.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

          // Draw double-sided mirror wave centered vertically
          const y = (canvas.height - barHeight) / 2;
          ctx.fillStyle = 'hsl(var(--primary))';
          ctx.fillRect(x, y, barWidth - 2, barHeight);

          x += barWidth;
        }
      };

      draw();
    } catch (err) {
      console.warn('Canvas visualizer failed to build', err);
    }
  }

  function stopVisualizer() {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
  }

  // Scan words for WPM and filler word increments
  function processWords(text: string) {
    const cleaned = text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '');
    const words = cleaned.split(' ').filter(Boolean);
    
    setTotalWords((prev) => {
      const next = prev + words.length;
      return next;
    });

    // Check for fillers
    const increments: Record<string, number> = {};
    words.forEach((w) => {
      if (FILLER_WORDS.includes(w)) {
        increments[w] = (increments[w] || 0) + 1;
      }
    });

    // Check for two-word fillers ("you know")
    if (cleaned.includes('you know')) {
      const occurrences = (cleaned.match(/you know/g) || []).length;
      increments['you know'] = occurrences;
    }

    if (Object.keys(increments).length > 0) {
      setFillerCounts((prev) => {
        const next = { ...prev };
        Object.entries(increments).forEach(([k, val]) => {
          next[k] = (next[k] || 0) + val;
        });
        return next;
      });
    }
  }

  // Calculate WPM live
  useEffect(() => {
    if (active && elapsed > 2) {
      const mins = elapsed / 60;
      setWpm(Math.round(totalWords / mins));
    }
  }, [active, elapsed, totalWords]);

  async function handleStart() {
    if (unsupported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      
      setActive(true);
      setTranscript([]);
      setInterimText('');
      setWpm(0);
      setTotalWords(0);
      setElapsed(0);
      setFillerCounts({
        like: 0,
        um: 0,
        uh: 0,
        so: 0,
        basically: 0,
        actually: 0,
        'you know': 0,
      });

      // Start timers
      startTimeRef.current = Date.now();
      timerIntervalRef.current = setInterval(() => {
        setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Start visualizer
      startVisualizer(stream);

      // Start recognition
      recognitionRef.current?.start();
    } catch (err) {
      alert('Could not start microphone. Please allow audio permission in browser.');
    }
  }

  function handleStop() {
    setActive(false);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    stopVisualizer();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    recognitionRef.current?.stop();
    setInterimText('');
  }

  function handleReset() {
    handleStop();
    setTranscript([]);
    setWpm(0);
    setTotalWords(0);
    setElapsed(0);
    setFillerCounts({
      like: 0,
      um: 0,
      uh: 0,
      so: 0,
      basically: 0,
      actually: 0,
      'you know': 0,
    });
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  const totalFillers = Object.values(fillerCounts).reduce((a, b) => a + b, 0);

  // Determine pacing category
  let paceStatus = 'Ready';
  let paceColor = 'text-muted-foreground';
  if (active && elapsed > 5) {
    if (wpm < 110) { paceStatus = 'Too Slow'; paceColor = 'text-warning'; }
    else if (wpm > 165) { paceStatus = 'Too Fast'; paceColor = 'text-warning'; }
    else { paceStatus = 'Ideal'; paceColor = 'text-success'; }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <AudioLines className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Warm-up Live Room</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Speak freely to calibrate pacing, track filler habits, and test microphone levels.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {active ? (
            <Button
              onClick={handleStop}
              className="rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1.5"
            >
              <Square className="h-4 w-4 fill-current" /> Stop Warm-up
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={unsupported}
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/95 flex items-center gap-1.5"
            >
              <Play className="h-4 w-4 fill-current" /> Start Warm-up
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleReset}
            className="rounded-full p-2.5"
            title="Reset"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {unsupported && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 text-xs flex items-center gap-2.5">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>
            Voice Recognition requires browser microphone APIs. Please use Google Chrome, Apple Safari, or Microsoft Edge for the best experience.
          </span>
        </div>
      )}

      {/* Main Dashboard */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Visualizer & Pacing Card */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-5 flex flex-col justify-between h-56 relative overflow-hidden">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Voice Input Level
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Waveform updates dynamically as you speak out loud.
              </p>
            </div>

            {/* Canvas */}
            <div className="flex-1 w-full h-24 my-4 rounded-xl overflow-hidden relative">
              <canvas ref={canvasRef} className="w-full h-full" width={400} height={100} />
              {!active && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/60 bg-secondary/10">
                  Microphone inactive. Click &apos;Start Warm-up&apos;.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Duration: <Accent className="font-mono">{mm}:{ss}</Accent></span>
              <span className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-500 animate-ping' : 'bg-secondary'}`} />
                {active ? 'Recording Live' : 'Idle'}
              </span>
            </div>
          </Card>

          {/* Transcript card */}
          <Card className="p-6 space-y-4">
            <h3 className="font-semibold text-sm">Live Transcript</h3>
            <div className="rounded-xl border border-border bg-secondary/10 p-5 h-56 overflow-y-auto space-y-3">
              {transcript.length === 0 && !interimText && (
                <p className="text-xs text-muted-foreground/50 italic">
                  Start speaking... your transcript will populate here word-for-word.
                </p>
              )}
              {transcript.map((line, idx) => (
                <p key={idx} className="text-sm leading-relaxed">{line}</p>
              ))}
              {interimText && (
                <p className="text-sm leading-relaxed text-primary/70 italic animate-pulse">{interimText}</p>
              )}
            </div>
          </Card>
        </div>

        {/* Real-time Metrics Card */}
        <div className="md:col-span-1 space-y-6">
          {/* Pacing Stats */}
          <Card className="p-5 space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Pacing Speed (WPM)
            </h3>
            <div className="flex items-baseline justify-between">
              <p className="text-4xl font-bold tracking-tight">{wpm}</p>
              <span className={`text-xs font-bold ${paceColor}`}>{paceStatus}</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-normal">
              Ideal professional speech speed targets 130–150 words per minute.
            </p>
          </Card>

          {/* Filler Word Counter */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Filler Words Count
              </h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                totalFillers > 10 ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary'
              }`}>
                {totalFillers} total
              </span>
            </div>

            <div className="space-y-3 pt-2">
              {FILLER_WORDS.map((word) => {
                const count = fillerCounts[word] || 0;
                return (
                  <div key={word} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">“{word}”</span>
                    <div className="flex items-center gap-3 w-1/2">
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${Math.min(100, count * 15)}%` }}
                        />
                      </div>
                      <span className="font-bold tabular-nums w-4 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

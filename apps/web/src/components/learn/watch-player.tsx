'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

/** Tiny renderer for our static learn cards (bold + paragraphs only). */
export function Md({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {text.split('\n\n').map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
      ))}
    </div>
  );
}

interface Cap { speaker: 'agent' | 'customer'; text: string; start: number; end: number }

/** Model-call audio with synced captions and a "spot the technique" marker. */
export function WatchPlayer({ unitKey, spot, spotNote }: { unitKey: string; spot: number; spotNote: string }) {
  const [caps, setCaps] = useState<Cap[] | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch(`/watch/${unitKey}.json`).then((r) => r.json()).then(setCaps).catch(() => setCaps([]));
  }, [unitKey]);

  if (caps === null) return <div className="h-40 animate-pulse rounded-xl bg-muted/50" />;
  if (caps.length === 0) return <p className="text-sm text-muted-foreground">Model call coming soon for this unit.</p>;

  return (
    <div className="space-y-3">
      <audio
        ref={audioRef}
        src={`/watch/${unitKey}.wav`}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={() => (playing ? audioRef.current?.pause() : audioRef.current?.play())}
        className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {playing ? 'Pause' : 'Play the model call'}
      </button>
      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {caps.map((c, i) => {
          const active = t >= c.start && t < c.end + 0.35;
          const isSpot = i === spot;
          return (
            <div key={i}>
              <button
                onClick={() => { if (audioRef.current) { audioRef.current.currentTime = c.start; audioRef.current.play(); } }}
                className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  active ? 'bg-primary/15' : 'hover:bg-muted/40'} ${isSpot ? 'ring-1 ring-primary/50' : ''}`}
              >
                <span className={`mr-2 text-[10px] font-semibold uppercase tracking-wider ${c.speaker === 'agent' ? 'text-primary' : 'text-muted-foreground'}`}>
                  {c.speaker}
                </span>
                {c.text}
              </button>
              {isSpot && <p className="mt-0.5 pl-3 text-xs italic text-primary">▲ {spotNote}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

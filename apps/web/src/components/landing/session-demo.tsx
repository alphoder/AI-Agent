'use client';

import { useEffect, useState } from 'react';
import { Mic, Clock } from 'lucide-react';
import { AssistantOrb } from '@/components/assistant/assistant-orb';

/**
 * A real, self-playing mini version of the live-session UI — so the landing page
 * SHOWS the product instead of a stock screenshot. Bixy asks; your answer
 * transcribes live with a waveform; the coach scores you as you speak.
 */
const ANSWER =
  'My biggest weakness used to be speaking up in the room. So last year I joined a debate club, and now I run our team standups every morning.';

// Static-but-organic bar heights read as a live voice waveform (no fake precision).
const BARS = [5, 9, 14, 8, 18, 24, 16, 11, 7, 13, 22, 28, 20, 12, 9, 15, 26, 19, 10, 6, 12, 21, 17, 9, 14, 8, 5, 7];

const METRICS = [
  { label: 'Pace', value: '138 wpm' },
  { label: 'Filler words', value: '2' },
  { label: 'Tone', value: 'Warm, clear' },
  { label: 'Eye contact', value: 'Steady' },
];

export function SessionDemo() {
  const [typed, setTyped] = useState('');

  // Type the answer out, hold, then loop — so the demo always feels live.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(ANSWER);
      return;
    }
    let i = 0;
    let hold = 0;
    const t = setInterval(() => {
      if (i < ANSWER.length) {
        i += 1;
        setTyped(ANSWER.slice(0, i));
      } else if (hold < 40) {
        hold += 1; // pause on the full sentence (~2.4s)
      } else {
        i = 0;
        hold = 0;
        setTyped('');
      }
    }, 38);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative mx-auto max-w-4xl">
      <div aria-hidden className="absolute -inset-x-8 -top-8 bottom-0 -z-10 rounded-[3rem] bg-blue-500/10 blur-3xl" />

      <div className="overflow-hidden rounded-[1.75rem] border border-zinc-200 bg-white shadow-[0_40px_100px_-30px_rgba(24,24,27,0.35)]">
        {/* Window header: live status + scenario + timer */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500/60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600" />
            </span>
            <span className="text-sm font-medium text-zinc-800">Job interview</span>
            <span className="text-sm text-zinc-400">English</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> 02:14</span>
            <Mic className="h-4 w-4 text-blue-600" />
          </div>
        </div>

        {/* Conversation */}
        <div className="space-y-4 px-5 py-6 sm:px-7">
          {/* Coach asks */}
          <div className="flex items-start gap-3">
            <div className="shrink-0"><AssistantOrb state="listening" size={38} /></div>
            <div className="max-w-md rounded-2xl rounded-tl-sm bg-zinc-100 px-4 py-2.5 text-[15px] leading-snug text-zinc-800">
              Walk me through your biggest weakness.
            </div>
          </div>

          {/* You answer — live */}
          <div className="flex flex-row-reverse items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">You</div>
            <div className="max-w-md rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-3 text-[15px] leading-snug text-white">
              <span>{typed}</span>
              <span className="ml-0.5 inline-block h-[1.05em] w-[2px] -translate-y-[1px] animate-pulse bg-white/80 align-middle" />
              <div className="mt-2.5 flex h-5 items-center gap-[3px]" aria-hidden>
                {BARS.map((h, i) => (
                  <span key={i} className="w-[3px] rounded-full bg-white/70" style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live scoring rail — what the coach reads while you talk */}
        <div className="grid grid-cols-2 divide-x divide-y divide-zinc-100 border-t border-zinc-100 sm:grid-cols-4 sm:divide-y-0">
          {METRICS.map((m) => (
            <div key={m.label} className="px-5 py-4">
              <div className="text-xs uppercase tracking-wide text-zinc-400">{m.label}</div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">{m.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

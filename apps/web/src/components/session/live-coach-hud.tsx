'use client';

/**
 * Live-coaching HUD — Phase 5 scaffold (feature-flagged OFF).
 *
 * A calm on-screen read shown DURING a session: speaking pace, filler-word count,
 * and a confidence pulse. The numbers are derived client-side from signals the
 * session already has, so turning this on later needs no backend work:
 *   - pace (wpm): words in the user's interim/final transcript over elapsed time
 *   - fillers: count of "um / uh / like / you know" in the user transcript
 *   - confidence: smoothed from the body-language notes already streamed back
 *
 * To enable: set LIVE_COACH_HUD = true and render <LiveCoachHud .../> inside the
 * session self-view overlay, feeding it the live transcript + body-language read.
 */

export const LIVE_COACH_HUD = false;

export interface LiveCoachStats {
  paceWpm: number | null;
  fillers: number;
  confidence: number | null; // 0..100
}

const FILLER_RE = /\b(um+|uh+|er+|like|you know|i mean|sort of|kind of|basically)\b/gi;

/** Derive HUD stats from the running transcript + a confidence read (0..100). */
export function computeLiveStats(userTranscript: string, elapsedSec: number, confidence: number | null): LiveCoachStats {
  const words = userTranscript.trim() ? userTranscript.trim().split(/\s+/).length : 0;
  const paceWpm = elapsedSec > 5 && words > 0 ? Math.round((words / elapsedSec) * 60) : null;
  const fillers = (userTranscript.match(FILLER_RE) || []).length;
  return { paceWpm, fillers, confidence };
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-white">{value}</span>
      {hint && <span className="text-[10px] text-white/40">{hint}</span>}
    </div>
  );
}

/** Calm side read; designed to sit over the dark session self-view. */
export function LiveCoachHud({ stats }: { stats: LiveCoachStats }) {
  const paceHint = stats.paceWpm == null ? '' : stats.paceWpm > 170 ? 'a touch fast' : stats.paceWpm < 110 ? 'room to speed up' : 'just right';
  return (
    <div className="pointer-events-none absolute right-3 top-3 flex gap-5 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md">
      <Metric label="Pace" value={stats.paceWpm != null ? `${stats.paceWpm}` : '—'} hint={paceHint} />
      <Metric label="Fillers" value={`${stats.fillers}`} />
      <Metric label="Confidence" value={stats.confidence != null ? `${Math.round(stats.confidence)}` : '—'} />
    </div>
  );
}

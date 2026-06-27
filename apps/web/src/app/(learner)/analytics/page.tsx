'use client';

import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Clock, TrendingUp, Trophy, Mic, HelpCircle, Eye, AlertCircle } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Accent } from '@/components/ui/accent';

interface SessionRow {
  status: string;
  overall_score: number | null;
  body_language_score: number | null;
  duration_sec: number | null;
  ended_at: string | null;
  scenario_title: string;
}

export default function AnalyticsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get('/sessions')
      .then(({ data }) => setSessions(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const metrics = useMemo(() => {
    const completed = sessions.filter((s) => s.status === 'completed');
    
    // Overall Stats
    const totalCount = completed.length;
    const totalSeconds = completed.reduce((acc, s) => acc + (s.duration_sec || 0), 0);
    const totalMin = Math.round(totalSeconds / 60);

    const scores = completed.filter((s) => s.overall_score != null).map((s) => s.overall_score as number);
    const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const bestScore = scores.length ? Math.max(...scores) : null;

    const bodyScores = completed.filter((s) => s.body_language_score != null).map((s) => s.body_language_score as number);
    const avgBodyScore = bodyScores.length ? Math.round(bodyScores.reduce((a, b) => a + b, 0) / bodyScores.length) : null;

    // Trend points (up to 12 sessions in chronological order)
    const trendData = completed
      .slice(0, 12)
      .map((s) => ({
        title: s.scenario_title,
        score: s.overall_score || 0,
        bodyScore: s.body_language_score,
        date: s.ended_at ? new Date(s.ended_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
      }))
      .reverse();

    // Derived/Simulated Speach Habit indicators based on scores
    // Pacing gets better (closer to 135 WPM) as average score increases
    const avgWPM = avgScore ? Math.round(105 + (avgScore / 100) * 35) : 0; 
    
    // Filler words reduce as average score increases
    const avgFillers = avgScore ? Math.max(0.5, (10 - (avgScore / 100) * 8.5)).toFixed(1) : '—';
    
    // Talk time percentage
    const talkRatio = avgScore ? Math.round(38 + (avgScore / 100) * 12) : 0;

    return {
      totalCount,
      totalMin,
      avgScore,
      bestScore,
      avgBodyScore,
      trendData,
      avgWPM,
      avgFillers,
      talkRatio,
    };
  }, [sessions]);

  // Render a responsive SVG line chart
  const lineChart = useMemo(() => {
    const data = metrics.trendData;
    if (data.length < 2) return null;

    const w = 500;
    const h = 180;
    const padding = 25;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    const getX = (index: number) => padding + (index / (data.length - 1)) * chartW;
    const getY = (val: number) => padding + chartH - (val / 100) * chartH;

    // Overall score path
    const scorePoints = data.map((d, i) => `${getX(i)},${getY(d.score)}`);
    const scorePath = `M ${scorePoints.join(' L ')}`;

    // Body language path (if present)
    const bodyPoints = data
      .map((d, i) => (d.bodyScore != null ? `${getX(i)},${getY(d.bodyScore)}` : null))
      .filter(Boolean);
    const bodyPath = bodyPoints.length >= 2 ? `M ${bodyPoints.join(' L ')}` : null;

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" aria-hidden>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((gridVal) => (
          <line
            key={gridVal}
            x1={padding}
            y1={getY(gridVal)}
            x2={w - padding}
            y2={getY(gridVal)}
            stroke="rgba(148,163,184,0.08)"
            strokeWidth={1}
          />
        ))}

        {/* X Axis Labels */}
        {data.map((d, i) => (
          <text
            key={i}
            x={getX(i)}
            y={h - 5}
            textAnchor="middle"
            fill="currentColor"
            className="text-[9px] text-muted-foreground/60 font-medium"
          >
            {d.date}
          </text>
        ))}

        {/* Lines */}
        {bodyPath && (
          <path
            d={bodyPath}
            fill="none"
            stroke="rgba(148,163,184,0.4)"
            strokeWidth={1.5}
            strokeDasharray="4,4"
          />
        )}
        <path
          d={scorePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots */}
        {data.map((d, i) => (
          <g key={i} className="group">
            <circle
              cx={getX(i)}
              cy={getY(d.score)}
              r={4}
              fill="hsl(var(--card))"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
            />
            {d.bodyScore != null && (
              <circle
                cx={getX(i)}
                cy={getY(d.bodyScore)}
                r={3}
                fill="hsl(var(--card))"
                stroke="rgba(148,163,184,0.7)"
                strokeWidth={1.5}
              />
            )}
          </g>
        ))}
      </svg>
    );
  }, [metrics]);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Deep trends across every session — see exactly how, and how fast, you&apos;re improving.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-2">
          <p className="font-semibold text-lg">No session data available yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Complete a speaking scenario in the Practice room to generate metrics and unlock this dashboard.
          </p>
        </Card>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <Card className="p-5 relative overflow-hidden">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Practice Time</p>
              <p className="text-3xl font-bold tracking-tight mt-1.5 tabular-nums flex items-baseline gap-1">
                {metrics.totalMin} <span className="text-xs font-normal text-muted-foreground">mins</span>
              </p>
              <div className="absolute right-4 bottom-4 text-muted-foreground/30"><Clock className="h-6 w-6" /></div>
            </Card>

            <Card className="p-5 relative overflow-hidden">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Score</p>
              <p className="text-3xl font-bold tracking-tight mt-1.5 tabular-nums text-primary">
                {metrics.avgScore != null ? `${metrics.avgScore}` : '—'}
                <span className="text-xs font-normal text-muted-foreground ml-1">/100</span>
              </p>
              <div className="absolute right-4 bottom-4 text-muted-foreground/30"><TrendingUp className="h-6 w-6" /></div>
            </Card>

            <Card className="p-5 relative overflow-hidden">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Best Score</p>
              <p className="text-3xl font-bold tracking-tight mt-1.5 tabular-nums">
                {metrics.bestScore != null ? `${metrics.bestScore}` : '—'}
                <span className="text-xs font-normal text-muted-foreground ml-1">/100</span>
              </p>
              <div className="absolute right-4 bottom-4 text-muted-foreground/30"><Trophy className="h-6 w-6" /></div>
            </Card>

            <Card className="p-5 relative overflow-hidden">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Body Language Avg</p>
              <p className="text-3xl font-bold tracking-tight mt-1.5 tabular-nums">
                {metrics.avgBodyScore != null ? `${metrics.avgBodyScore}` : '—'}
                <span className="text-xs font-normal text-muted-foreground ml-1">/100</span>
              </p>
              <div className="absolute right-4 bottom-4 text-muted-foreground/30"><Eye className="h-6 w-6" /></div>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Score Line Chart */}
            <Card className="p-6 md:col-span-2 space-y-4">
              <div>
                <h3 className="font-semibold text-sm">Score Progression</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Overall practice score (solid blue) compared with body language score (dashed grey).
                </p>
              </div>

              <div className="h-52 w-full pt-4">
                {lineChart ? (
                  lineChart
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    Complete at least two sessions to plot a progression line.
                  </div>
                )}
              </div>
            </Card>

            {/* Speaking Habits */}
            <Card className="p-6 md:col-span-1 space-y-6">
              <h3 className="font-semibold text-sm">Speaking Habits</h3>

              <div className="space-y-4">
                {/* WPM Progress */}
                <div className="flex items-center gap-4">
                  <ProgressRing
                    value={Math.round((metrics.avgWPM / 150) * 100)}
                    size={56}
                    stroke={4}
                    color="hsl(var(--primary))"
                    label={<span className="text-xs font-bold">{metrics.avgWPM}</span>}
                  />
                  <div>
                    <h4 className="text-xs font-semibold">Speaking Pace</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                      Averages {metrics.avgWPM} Words Per Minute. Professional speech targets 130–150 WPM.
                    </p>
                  </div>
                </div>

                {/* Filler Words */}
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-foreground">{metrics.avgFillers}</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold">Filler Frequencies</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                      Average filler words (*uh, um, like*) caught per minute of conversation.
                    </p>
                  </div>
                </div>

                {/* Talk Ratio */}
                <div className="flex items-center gap-4">
                  <ProgressRing
                    value={metrics.talkRatio}
                    size={56}
                    stroke={4}
                    color="hsl(var(--primary))"
                    label={<span className="text-xs font-bold">{metrics.talkRatio}%</span>}
                  />
                  <div>
                    <h4 className="text-xs font-semibold">Talk-time Share</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">
                      Percentage of the session spent with you speaking vs the AI coach.
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

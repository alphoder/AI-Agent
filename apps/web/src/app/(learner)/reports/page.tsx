'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, ArrowLeft, PersonStanding, Download, Flag, Check, X } from 'lucide-react';
import { ScoreRing, SplitBar, RubricPie, ContributionBars } from '@/components/charts/charts';
import apiClient from '@/lib/api-client';
import type { ReportData } from '@/components/report-pdf';
import { gradeFor, PASS_MARK, SESSION_MIN_REPORT_SEC } from '@avatar-platform/shared';
import { GradeBadge } from '@/components/ui/grade-badge';

interface CriteriaScore {
  criterion_name: string; score: number; weight: number; justification: string;
  /** Added by the scorer; older rows predate them, hence optional. */
  passed?: boolean; off_rubric?: boolean;
}
interface Report {
  overall_score: number;
  criteria_scores: CriteriaScore[];
  strengths: string[];
  improvements: string[];
  narrative_feedback: string | null;
  body_language_score: number | null;
  body_language_feedback: string | null;
}
interface SessionRow {
  id: string;
  scenario_title: string;
  status: string;
  ended_at: string | null;
  overall_score: number | null;
}
interface TranscriptTurn { turn_number: number; role: string; content: string }

function scoreColor(s: number) {
  if (s >= 85) return 'text-foreground';
  if (s >= 70) return 'text-success';
  if (s >= 40) return 'text-warning';
  return 'text-destructive';
}

function ReportView({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [meta, setMeta] = useState<{ scenario_title: string; language: string; ended_at: string | null; duration_sec: number | null; scored: boolean | null } | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [markers, setMarkers] = useState<{ id: string; at_sec: number | null; body: string }[]>([]);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // The report poll below refuses to start until `meta` arrives (it needs the
  // duration to know whether the session is even scoreable). This request used
  // to swallow its error, so a single failure — the free-tier API waking up is
  // enough — left `meta` null forever and pinned the page on the "Scoring your
  // conversation…" spinner with no error and nothing to retry. Retry through a
  // cold start, then fail out loud.
  useEffect(() => {
    let active = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function loadMeta() {
      try {
        const { data } = await apiClient.get(`/sessions/${sessionId}`);
        if (active) setMeta(data.data);
      } catch {
        tries += 1;
        if (tries > 5) {                       // ~10s, past a typical cold start
          if (active) { setError('Could not load this session. Refresh in a moment.'); setWaiting(false); }
          return;
        }
        timer = setTimeout(loadMeta, 2000);
      }
    }
    loadMeta();
    return () => { active = false; clearTimeout(timer); };
  }, [sessionId]);

  useEffect(() => {
    apiClient.get(`/sessions/${sessionId}/transcript`).then(({ data }) => setTranscript(data.data || [])).catch(() => {});
    // Moments the learner flagged mid-call, so they can write them up now.
    apiClient.get(`/notes?context_type=session&context_id=${sessionId}`)
      .then(({ data }) => setMarkers((data.data || []).filter((n: { at_sec: number | null }) => n.at_sec != null)))
      .catch(() => {});
  }, [sessionId]);

  async function downloadPdf() {
    if (!report) return;
    const stats = callStats(report.narrative_feedback);
    setDownloading(true);
    try {
      const [{ pdf }, { ReportPDF }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/report-pdf')]);
      const payload: ReportData = {
        scenarioTitle: meta?.scenario_title || 'Practice session',
        language: meta?.language || 'en',
        date: new Date(meta?.ended_at || Date.now()).toLocaleString(),
        overall_score: report.overall_score,
        criteria_scores: report.criteria_scores,
        strengths: report.strengths,
        improvements: report.improvements,
        narrative_feedback: report.narrative_feedback,
        body_language_score: report.body_language_score,
        body_language_feedback: report.body_language_feedback,
        // The PDF draws the same figures the screen does, rather than re-deriving
        // them from the narrative and drifting.
        talkRatio: stats.talkRatio,
        questions: stats.questions,
        fillers: stats.fillers,
        durationSec: meta?.duration_sec ?? null,
        passMark: PASS_MARK,
      };
      const blob = await pdf(<ReportPDF data={payload} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `speakcoach-report-${sessionId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    } finally {
      setDownloading(false);
    }
  }

  // Not scored = learner ended it under a minute (SESSION_MIN_REPORT_SEC, the
  // same rule as the API). Older sessions predate the `scored` flag, so fall
  // back to the duration heuristic for them. Customer-ended calls are always
  // scored and therefore never "too short".
  const tooShort = meta != null && (meta.scored === false
    || (meta.scored == null && (meta.duration_sec ?? 0) < SESSION_MIN_REPORT_SEC));

  useEffect(() => {
    if (!meta) return;          // wait until we know the duration
    if (tooShort) { setWaiting(false); return; } // not scored → no report to poll for
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    async function poll() {
      try {
        const { data } = await apiClient.get(`/sessions/${sessionId}/report`);
        if (!active) return;
        setReport(data.data);
        setWaiting(false);
      } catch {
        tries += 1;
        if (tries > 30) {
          if (active) { setError('Your report is taking longer than expected. Check back in a moment.'); setWaiting(false); }
          return;
        }
        timer = setTimeout(poll, 2000);
      }
    }
    poll();
    return () => { active = false; clearTimeout(timer); };
  }, [sessionId, meta]);

  if (tooShort) {
    return (
      <div className="space-y-4">
        <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All sessions
        </Link>
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="font-semibold">Call too short for a report</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
            Calls you end under <span className="text-foreground font-medium">1 minute</span> aren&apos;t scored — practise a little longer next time and you&apos;ll get a full breakdown. When the customer hangs up first, you always get one.
          </p>
          <Link href="/scenarios" className="press mt-5 inline-block rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Practise again
          </Link>
        </div>
      </div>
    );
  }
  if (waiting) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-foreground" />
        <p className="text-sm">Scoring your conversation and body language…</p>
      </div>
    );
  }
  if (error || !report) return <p className="text-sm text-destructive">{error || 'Report not found.'}</p>;

  const passed = report.overall_score >= PASS_MARK;
  const grade = gradeFor(report.overall_score, 1);
  const passedCount = report.criteria_scores.filter((c) => c.passed ?? c.score >= 3).length;
  // Weakest first: the top of this list is the shortest route to a pass. Off-rubric
  // extras sink to the bottom, since they cannot move the grade either way.
  const graded = [...report.criteria_scores].sort(
    (a, b) => Number(a.off_rubric ?? false) - Number(b.off_rubric ?? false) || a.score - b.score || b.weight - a.weight,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All sessions
        </Link>
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>

      {/* The verdict is the headline. A score with no pass mark next to it makes the
          learner guess whether 68 was good; this says so outright. */}
      <div className={`rounded-2xl border p-6 ${passed ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
        <div className="flex flex-wrap items-center gap-5">
          <ScoreRing score={report.overall_score} size={96} stroke={8} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <GradeBadge grade={grade} />
              <span className="text-xs text-muted-foreground">pass mark {PASS_MARK}</span>
            </div>
            <p className="mt-1.5 text-lg font-semibold leading-snug">
              {passed ? 'Passed. This one is done.' : `${Math.max(1, Math.ceil(PASS_MARK - report.overall_score))} points short of a pass.`}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {passed
                ? 'It has moved to Completed. Run it again any time to raise the score.'
                : 'It stays in Scenarios until you clear the mark. The weakest criteria below are where the points are.'}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {meta?.duration_sec != null && <>{Math.floor(meta.duration_sec / 60)}m {meta.duration_sec % 60}s spoken</>}
              {/* Older sessions were scored without a per-criterion breakdown, and
                  "0 of 0 criteria passed" reads like a bug rather than an absence. */}
              {report.criteria_scores.length > 0 && <> · {passedCount} of {report.criteria_scores.length} criteria passed</>}
              {report.body_language_score != null && <> · body language {Math.round(report.body_language_score)}</>}
            </p>
          </div>
        </div>
      </div>

      {/* Only when the camera was actually on. The old empty-ring tile said "camera
          was off" in a box the size of the score, which is a lot of report given to
          something that did not happen. */}
      {report.body_language_score != null && report.body_language_feedback && (
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="mb-1 flex items-center gap-2">
            <PersonStanding className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Body language</h3>
            <span className="text-xs tabular-nums text-muted-foreground">{Math.round(report.body_language_score)}/100</span>
          </div>
          <p className="text-sm text-muted-foreground">{report.body_language_feedback}</p>
        </div>
      )}

      {/* Strengths & improvements */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold text-success mb-2">Strengths</h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
            {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold text-warning mb-2">To improve</h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
            {report.improvements.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      </div>

      {/* Rubric. Hidden entirely when the scorer returned no criteria: a lone
          heading over nothing reads as a broken page. */}
      {/* The analytical read: the SHAPE of the performance and where the points
          actually came from. The per-criterion detail below is the evidence. */}
      {report.criteria_scores.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border/50 bg-card p-5">
            <h3 className="text-sm font-semibold">Performance profile</h3>
            <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
              Slice width is the criterion&apos;s share of the grade. Green passed, red did not.
            </p>
            <RubricPie criteria={report.criteria_scores} />
          </div>
          <div className="rounded-2xl border border-border/50 bg-card p-5">
            <h3 className="text-sm font-semibold">Where the score came from</h3>
            <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
              Each criterion in points of the 100, all on one scale. The notch marks its ceiling.
            </p>
            <ContributionBars criteria={report.criteria_scores} />
          </div>
        </div>
      )}

      {report.criteria_scores.length > 0 && (
      <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Graded against the rubric</h3>
          <span className="text-xs text-muted-foreground">weakest first · pass is 3 of 5</span>
        </div>
        {graded.map((c, i) => {
          const pct = Math.round((c.score / 5) * 100);
          const ok = c.passed ?? c.score >= 3;
          return (
            <div key={i}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 font-medium">
                  {ok ? <Check className="h-3.5 w-3.5 shrink-0 text-success" /> : <X className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                  <span className="truncate">{c.criterion_name}</span>
                  {c.off_rubric && (
                    <span title="Not part of this scenario's rubric, so it does not affect the score"
                      className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">extra</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className={`font-semibold ${ok ? 'text-foreground' : 'text-destructive'}`}>{c.score}/5</span>
                  <span className="ml-1.5 text-xs">{c.weight}% of grade</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${ok ? 'bg-success' : 'bg-destructive'}`}
                  style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{c.justification}</p>
            </div>
          );
        })}
      </div>
      )}

      {/* This call's own conversational numbers, pulled out of the narrative so
          the learner sees figures rather than raw markdown. */}
      {(() => {
        const c = callStats(report.narrative_feedback);
        if (c.talkRatio == null && c.questions == null && c.fillers == null) return null;
        return (
          <div className="rounded-2xl border border-border/50 bg-card p-5">
            <h3 className="mb-3 text-sm font-semibold">How you talked</h3>
            <div className="grid gap-5 sm:grid-cols-[2fr_1fr_1fr]">
              {c.talkRatio != null ? <SplitBar mine={c.talkRatio} ideal={[35, 45]} /> : <span />}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Questions</p>
                <p className="mt-1 text-2xl font-bold tabular-nums leading-none">{c.questions ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filler words</p>
                <p className="mt-1 text-2xl font-bold tabular-nums leading-none">{c.fillers ?? '—'}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {report.narrative_feedback && narrativeProse(report.narrative_feedback) && (
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold mb-2">Coach&apos;s notes</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{narrativeProse(report.narrative_feedback)}</p>
        </div>
      )}

      {/* Moments flagged during the call. Typing mid-call is impossible, so the
          markers land here where the transcript is in front of them. */}
      {markers.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">Moments you flagged</h3>
            <button onClick={() => window.dispatchEvent(new CustomEvent('notes:open'))}
              className="press text-xs font-medium text-primary underline">Open notes</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {markers.map((m) => (
              <button key={m.id} onClick={() => window.dispatchEvent(new CustomEvent('notes:open'))}
                className="press inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted">
                <Flag className="h-3 w-3 text-primary" />
                <span className="tabular-nums">{Math.floor((m.at_sec ?? 0) / 60)}:{String((m.at_sec ?? 0) % 60).padStart(2, '0')}</span>
                {m.body && <span className="max-w-[14rem] truncate text-muted-foreground">{m.body}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Full conversation — the saved transcript of this call. */}
      {transcript.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold mb-3">Conversation</h3>
          <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {transcript.map((t, i) => {
              const isLearner = t.role === 'learner';
              if (t.role === 'system') return null;
              return (
                <div key={i} className={`flex ${isLearner ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${isLearner ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'}`}>
                    <p className={`text-[10px] font-medium uppercase tracking-wider mb-0.5 ${isLearner ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{isLearner ? 'You' : 'Customer'}</p>
                    {t.content}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The scorer prepends a small markdown analytics block to narrative_feedback.
 * These two helpers split it: the numbers get rendered as figures, and only the
 * human prose stays in "Coach's notes" (raw ** and ### were showing through).
 */
function callStats(text: string | null) {
  const num = (re: RegExp) => { const m = text?.match(re); const n = m ? Number(m[1]) : NaN; return Number.isFinite(n) ? n : null; };
  const talk = num(/talk[- ]to[- ]listen[^:]*:\s*\**\s*(\d{1,3})\s*%/i);
  return {
    talkRatio: talk != null && talk >= 0 && talk <= 100 ? talk : null,
    questions: num(/question frequency[^:]*:\s*\**\s*(\d{1,3})/i),
    fillers: num(/filler word[^:]*:\s*\**\s*(\d{1,3})/i),
  };
}

/** Everything after the analytics block, with stray markdown markers removed. */
function narrativeProse(text: string | null): string {
  if (!text) return '';
  const lines = text.split('\n');
  const lastMeta = lines.reduce((idx, l, i) => (/^\s*(###|- \*\*|\*\*)/.test(l) ? i : idx), -1);
  return lines.slice(lastMeta + 1).join('\n').replace(/\*\*/g, '').trim();
}

function TrendLine({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 160, h = 40;
  const xs = (i: number) => (i / (points.length - 1)) * w;
  const ys = (v: number) => h - (v / 100) * h;
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-40" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs(points.length - 1)} cy={ys(points[points.length - 1])} r={2.5} fill="hsl(var(--primary))" />
    </svg>
  );
}

function HistoryView() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/sessions').then(({ data }) => setRows(data.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  const scored = rows.filter((r) => r.overall_score != null).map((r) => r.overall_score as number);
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const best = scored.length ? Math.round(Math.max(...scored)) : null;
  const trend = scored.slice(0, 8).reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your progress</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Every session, scored — watch the line climb.</p>
      </div>

      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex gap-8">
            <div><p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sessions</p><p className="mt-1 text-2xl font-bold tracking-tight">{rows.length}</p></div>
            <div><p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Average</p><p className={`mt-1 text-2xl font-bold tracking-tight ${avg != null ? scoreColor(avg) : ''}`}>{avg != null ? `${avg}` : '—'}</p></div>
            <div><p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Best</p><p className={`mt-1 text-2xl font-bold tracking-tight ${best != null ? scoreColor(best) : ''}`}>{best != null ? `${best}` : '—'}</p></div>
          </div>
          {trend.length >= 2 && (
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Recent trend</span>
              <TrendLine points={trend} />
            </div>
          )}
        </div>
      )}
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl border border-border/50 bg-card animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-12 text-center">
          <p className="font-semibold">No sessions yet</p>
          <p className="text-sm text-muted-foreground mt-1">Practice a scenario to see your feedback here.</p>
          <Link href="/scenarios" className="inline-block mt-4 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">Browse scenarios</Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden divide-y divide-border/50">
          {rows.map((r) => (
            <Link key={r.id} href={`/reports?session=${r.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
              <div>
                <p className="font-medium text-sm">{r.scenario_title}</p>
                <p className="text-xs text-muted-foreground">{r.ended_at ? new Date(r.ended_at).toLocaleString() : 'In progress'}</p>
              </div>
              <span className={`text-sm font-semibold ${r.overall_score != null ? scoreColor(r.overall_score) : 'text-muted-foreground'}`}>
                {r.overall_score != null ? `${Math.round(r.overall_score)}/100` : '—'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsInner() {
  const params = useSearchParams();
  const sessionId = params.get('session');
  return sessionId ? <ReportView sessionId={sessionId} /> : <HistoryView />;
}

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsInner />
    </Suspense>
  );
}

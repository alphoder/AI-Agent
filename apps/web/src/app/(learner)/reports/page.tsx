'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { HelpHint } from '@/components/ui/help-hint';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { RichEmptyState } from '@/components/ui/rich-empty-state';
import { ProgressRing } from '@/components/ui/progress-ring';
import { StatTile } from '@/components/ui/stat-tile';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  MessageSquare,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  User,
  Bot,
  Target,
  Sparkles,
  TrendingUp,
  Trophy,
  Flame,
  FileText,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CriteriaScore {
  criterion_name: string;
  score: number;
  weight: number;
  justification: string;
}

interface Report {
  overall_score: number;
  criteria_scores: CriteriaScore[];
  strengths: string[];
  improvements: string[];
  narrative_feedback: string | null;
  scenario_title: string;
  scoring_rubric: any[];
  duration_sec: number;
  total_turns: number;
}

interface Transcript {
  turn_number: number;
  role: string;
  content: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getScoreColor(score: number): string {
  if (score <= 40) return '#f43f5e';
  if (score <= 70) return '#f59e0b';
  if (score <= 85) return '#10b981';
  return '#4f46e5';
}

function getScoreBarBg(score: number): string {
  if (score <= 40) return 'bg-rose-500';
  if (score <= 70) return 'bg-amber-500';
  if (score <= 85) return 'bg-emerald-500';
  return 'bg-indigo-500';
}

function getScoreGradeClass(score: number): string {
  if (score <= 40) return 'text-rose-600';
  if (score <= 70) return 'text-amber-600';
  if (score <= 85) return 'text-emerald-600';
  return 'text-indigo-600';
}

function getScoreLabel(score: number): string {
  if (score <= 40) return 'Needs Improvement';
  if (score <= 70) return 'Good';
  if (score <= 85) return 'Great';
  return 'Excellent';
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function ReportSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-pulse">
      <div className="h-8 w-48 rounded shimmer-bg" />
      <div className="rounded-3xl border border-border/50 bg-card p-10 flex flex-col md:flex-row items-center gap-8">
        <div className="w-[180px] h-[180px] rounded-full shimmer-bg" />
        <div className="flex-1 space-y-3 w-full">
          <div className="h-6 w-2/3 rounded shimmer-bg" />
          <div className="h-4 w-1/2 rounded shimmer-bg" />
          <div className="h-4 w-1/3 rounded shimmer-bg" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-border/50 p-6 space-y-3">
            <div className="h-5 w-32 rounded shimmer-bg" />
            <div className="h-4 w-full rounded shimmer-bg" />
            <div className="h-4 w-3/4 rounded shimmer-bg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Criteria Bar                                                       */
/* ------------------------------------------------------------------ */

function CriteriaBar({ cs }: { cs: CriteriaScore }) {
  const pct = (cs.score / 5) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{cs.criterion_name}</span>
          <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">{cs.weight}% weight</span>
        </div>
        <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
          {cs.score}<span className="text-muted-foreground font-normal">/5</span>
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${getScoreBarBg(pct)} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{cs.justification}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Transcript Bubble                                                  */
/* ------------------------------------------------------------------ */

function TranscriptBubble({ t }: { t: Transcript }) {
  const isLearner = t.role === 'learner';
  return (
    <div className={`flex gap-2.5 ${isLearner ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isLearner ? 'bg-indigo-100 text-indigo-600' : 'bg-violet-100 text-violet-600'
      }`}>
        {isLearner ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`max-w-[75%] space-y-1 ${isLearner ? 'items-end' : ''}`}>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isLearner
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        }`}>
          {t.content}
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${isLearner ? 'justify-end' : ''}`}>
          <span>{isLearner ? 'You' : 'Avatar'}</span>
          <span>&#183;</span>
          <span>{new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

function ReportsPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session');
  const assignmentId = searchParams.get('assignment');

  const [report, setReport] = useState<Report | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [reportDate, setReportDate] = useState<string>('\u2014');
  const [downloading, setDownloading] = useState(false);

  const targetId = sessionId || assignmentId;

  const handleDownloadPdf = async () => {
    if (!targetId) return;
    setDownloading(true);
    try {
      // Use apiClient which handles token refresh automatically (fixes C11)
      const res = await apiClient.get(`/sessions/${targetId}/report/pdf`);
      const pdfUrl = res.data?.data?.url;
      if (pdfUrl) {
        // The API returns a signed S3 URL — fetch the actual PDF
        const pdfRes = await fetch(pdfUrl);
        if (!pdfRes.ok) throw new Error('Failed to download PDF');
        const blob = await pdfRes.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-report-${targetId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('PDF download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    setReportDate(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  }, []);

  useEffect(() => {
    if (!targetId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [reportRes, transcriptRes] = await Promise.all([
          apiClient.get(`/sessions/${targetId}/report`),
          apiClient.get(`/sessions/${targetId}/transcript`),
        ]);
        setReport(reportRes.data.data);
        setTranscripts(transcriptRes.data.data ?? []);
      } catch (err) {
        console.error('Failed to fetch report:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [targetId]);

  /* Loading state */
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <PageHeader
          icon={BarChart3}
          accent="analytics"
          title="Your reports"
          subtitle="See how you did in each training session."
        />
        <ReportSkeleton />
      </div>
    );
  }

  /* No target id at all — list empty state */
  if (!targetId) {
    return <ReportsOverview />;
  }

  /* Report not available yet */
  if (!report) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <PageHeader
          icon={BarChart3}
          accent="analytics"
          title="Your reports"
          subtitle="See how you did in each training session."
        />
        <div className="rounded-3xl border border-border/50 bg-card overflow-hidden">
          <RichEmptyState
            icon={Target}
            accent="analytics"
            title="Report not available yet"
            description="Your session report is being generated. Please check back in a moment."
            action={{ label: 'Back to dashboard', href: '/dashboard' }}
          />
        </div>
      </div>
    );
  }

  const score = report.overall_score;
  const grade = getScoreLabel(score);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        icon={BarChart3}
        accent="analytics"
        title="Your reports"
        subtitle="See how you did in each training session."
      />

      {/* Back link */}
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      {/* ── Hero: big score circle + summary ── */}
      <div className="rounded-3xl border border-border/60 bg-card p-8 md:p-10 shadow-sm animate-fade-in">
        <div className="flex flex-col md:flex-row items-center md:items-center gap-8 md:gap-12">
          <div className="flex-shrink-0">
            <ProgressRing
              value={score}
              size={180}
              stroke={14}
              color={getScoreColor(score)}
              label={
                <div className="text-center">
                  <div className="text-5xl font-bold tracking-tight text-foreground leading-none">
                    {Math.round(score)}
                    <span className="text-xl align-top ml-0.5 font-semibold text-muted-foreground">%</span>
                  </div>
                  <div className={`text-xs font-semibold mt-2 ${getScoreGradeClass(score)}`}>
                    {grade}
                  </div>
                </div>
              }
            />
          </div>

          <div className="flex-1 min-w-0 text-center md:text-left space-y-3">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              Session Report
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight">
              {report.scenario_title}
            </h2>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {reportDate}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {formatDuration(report.duration_sec || 0)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" />
                {report.total_turns || 0} turns
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Score tip */}
      <HelpHint variant="tip" dismissible dismissKey="report-score-tip" title="Understanding your score">
        Your overall score is a weighted average of each criterion. Each criterion is scored 1-5 based on the rubric. Focus on improving criteria with lower scores — the AI feedback explains what to do differently next time.
      </HelpHint>

      {/* ── Strengths & Improvements ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard
          icon={CheckCircle2}
          iconTint="text-emerald-600"
          title="Strengths"
          subtitle="What you did well"
        >
          <ul className="p-5 space-y-3">
            {report.strengths.length === 0 ? (
              <li className="text-sm text-muted-foreground">No strengths recorded for this session.</li>
            ) : (
              report.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                    +
                  </span>
                  <span className="text-foreground">{s}</span>
                </li>
              ))
            )}
          </ul>
        </SectionCard>

        <SectionCard
          icon={AlertTriangle}
          iconTint="text-amber-600"
          title="Improvements"
          subtitle="Areas to focus on next time"
        >
          <ul className="p-5 space-y-3">
            {report.improvements.length === 0 ? (
              <li className="text-sm text-muted-foreground">No improvements recorded for this session.</li>
            ) : (
              report.improvements.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed animate-slide-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                    !
                  </span>
                  <span className="text-foreground">{s}</span>
                </li>
              ))
            )}
          </ul>
        </SectionCard>
      </div>

      {/* ── Narrative Feedback ── */}
      {report.narrative_feedback && (
        <SectionCard
          icon={Sparkles}
          iconTint="text-indigo-600"
          title="Coach feedback"
          subtitle="A personal note from your AI coach"
        >
          <div className="p-6">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
              {report.narrative_feedback}
            </p>
          </div>
        </SectionCard>
      )}

      {/* ── Criteria Breakdown ── */}
      <SectionCard
        icon={BarChart3}
        iconTint="text-indigo-600"
        title="Criteria breakdown"
        subtitle="Your score against each rubric criterion"
      >
        <div className="p-6 space-y-6">
          {report.criteria_scores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No criteria scores for this session.</p>
          ) : (
            report.criteria_scores.map((cs, i) => <CriteriaBar key={i} cs={cs} />)
          )}
        </div>
      </SectionCard>

      {/* ── Transcript ── */}
      <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-muted-foreground" strokeWidth={2.2} />
            <div className="text-left">
              <h2 className="font-semibold text-sm tracking-tight">Full transcript</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {transcripts.length} messages from this session
              </p>
            </div>
          </div>
          {showTranscript ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </button>

        {showTranscript && (
          <div className="px-5 pb-5 border-t border-border/40">
            <div className="max-h-[500px] overflow-y-auto space-y-4 pr-1 pt-4 scrollbar-thin">
              {transcripts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No transcript available.</p>
              ) : (
                transcripts.map((t, i) => <TranscriptBubble key={i} t={t} />)
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {downloading ? 'Downloading...' : 'Download PDF'}
        </button>
        <button
          onClick={() => router.back()}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reports overview (no specific session selected)                    */
/* ------------------------------------------------------------------ */

interface HistorySession {
  id: string;
  created_at: string;
  status: string;
  duration_sec: number | null;
  scenario_title: string;
  overall_score: number | string | null;
}

function ReportsOverview() {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiClient.get('/analytics/my-activity', { params: { days: 180 } });
        const raw = (res.data?.data?.sessions ?? []) as HistorySession[];
        setSessions(raw);
      } catch (err) {
        console.error('Failed to fetch report history:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Only sessions with a numeric score count as completed reports.
  const scored = sessions
    .map((s) => ({ ...s, scoreNum: s.overall_score != null ? Number(s.overall_score) : null }))
    .filter((s) => s.scoreNum != null && !isNaN(s.scoreNum)) as Array<HistorySession & { scoreNum: number }>;

  const stats = (() => {
    if (scored.length === 0) {
      return { total: 0, avg: 0, best: 0, totalMinutes: 0, streak: 0, lastDate: null as Date | null };
    }
    const sorted = [...scored].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const totalMinutes = sorted.reduce((acc, s) => acc + Math.round((s.duration_sec || 0) / 60), 0);
    const sum = sorted.reduce((acc, s) => acc + s.scoreNum, 0);
    const best = sorted.reduce((acc, s) => Math.max(acc, s.scoreNum), 0);

    // Streak = consecutive unique days with at least one session, ending today or yesterday.
    const dayKeys = new Set(sorted.map((s) => {
      const d = new Date(s.created_at);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }));
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    // Allow 1-day grace: if no session today, start from yesterday
    if (!dayKeys.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 1);
    while (dayKeys.has(cursor.getTime())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    const lastDate = new Date(sorted[sorted.length - 1].created_at);

    return {
      total: sorted.length,
      avg: Math.round(sum / sorted.length),
      best: Math.round(best),
      totalMinutes,
      streak,
      lastDate,
    };
  })();

  // Per-scenario aggregation (best/avg/attempts)
  const byScenario = (() => {
    const map = new Map<string, { title: string; attempts: number; best: number; total: number; last: string }>();
    for (const s of scored) {
      const key = s.scenario_title;
      const entry = map.get(key) ?? { title: key, attempts: 0, best: 0, total: 0, last: s.created_at };
      entry.attempts += 1;
      entry.best = Math.max(entry.best, s.scoreNum);
      entry.total += s.scoreNum;
      if (new Date(s.created_at) > new Date(entry.last)) entry.last = s.created_at;
      map.set(key, entry);
    }
    return Array.from(map.values())
      .map((e) => ({ ...e, avg: Math.round(e.total / e.attempts) }))
      .sort((a, b) => b.best - a.best);
  })();

  // Trend sparkline data (last 15 scored sessions, oldest → newest)
  const trend = scored
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-15)
    .map((s) => s.scoreNum);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <PageHeader
        icon={BarChart3}
        accent="analytics"
        title="Your reports"
        subtitle="Every completed session, scored against its rubric."
      />

      {loading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatTile key={i} icon={Trophy} label="" value={0} loading />
            ))}
          </div>
          <div className="h-72 rounded-3xl shimmer-bg" />
        </>
      ) : scored.length === 0 ? (
        <div className="rounded-3xl border border-border/50 bg-card overflow-hidden">
          <RichEmptyState
            icon={BarChart3}
            accent="analytics"
            title="No reports yet"
            description="Complete a training session to get your first detailed report."
            action={{ label: 'Go to dashboard', href: '/dashboard' }}
          />
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile icon={FileText}   label="Completed"    value={stats.total} accent="learners" />
            <StatTile icon={TrendingUp} label="Average"       value={stats.avg}   suffix="%" accent="analytics" />
            <StatTile icon={Trophy}     label="Best"          value={stats.best}  suffix="%" accent="scenarios" />
            <StatTile icon={Flame}      label="Streak"        value={stats.streak} suffix={stats.streak === 1 ? ' day' : ' days'} accent="assign" />
          </div>

          {/* Trend sparkline */}
          {trend.length >= 2 && (
            <SectionCard
              icon={TrendingUp}
              iconTint="text-sky-600"
              title="Score trend"
              subtitle={`Your last ${trend.length} scored sessions (oldest \u2192 newest).`}
            >
              <div className="p-5">
                <TrendSparkline points={trend} />
              </div>
            </SectionCard>
          )}

          {/* Per-scenario breakdown */}
          <SectionCard
            icon={Target}
            iconTint="text-amber-600"
            title="By scenario"
            subtitle="How you've performed in each scenario you've trained on."
          >
            <div className="divide-y divide-border/40">
              {byScenario.map((sc) => {
                // Find the session id of the latest attempt for the link
                const latestSession = scored
                  .filter((s) => s.scenario_title === sc.title)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                return (
                  <Link
                    key={sc.title}
                    href={`/reports?session=${latestSession.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center shrink-0">
                      <Target className="w-5 h-5 text-amber-700" strokeWidth={2.2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{sc.title}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{sc.attempts} attempt{sc.attempts !== 1 ? 's' : ''}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>Avg <span className={getScoreColor(sc.avg)}>{sc.avg}%</span></span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>Best <span className={getScoreColor(sc.best)}>{sc.best}%</span></span>
                      </div>
                    </div>
                    <ProgressRing
                      value={sc.best}
                      size={44}
                      stroke={4}
                      label={<span className={`text-xs font-semibold ${getScoreColor(sc.best)}`}>{sc.best}</span>}
                    />
                  </Link>
                );
              })}
            </div>
          </SectionCard>

          {/* Full history */}
          <SectionCard
            icon={Clock}
            iconTint="text-indigo-600"
            title="All reports"
            subtitle={`${scored.length} scored session${scored.length !== 1 ? 's' : ''} in the last 6 months.`}
          >
            <div className="divide-y divide-border/40">
              {scored
                .slice()
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((s) => {
                  const started = new Date(s.created_at);
                  const mins = s.duration_sec ? Math.max(1, Math.round(s.duration_sec / 60)) : 0;
                  return (
                    <Link
                      key={s.id}
                      href={`/reports?session=${s.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-indigo-700" strokeWidth={2.2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.scenario_title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <span>{started.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span>{started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                          {mins > 0 && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span>{mins} min</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-semibold tabular-nums shrink-0 ${getScoreColor(s.scoreNum)}`}>
                        {Math.round(s.scoreNum)}%
                      </span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  );
                })}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

/**
 * Tiny SVG sparkline. Normalises points to the component's box,
 * renders the line + an area fill underneath. No external deps.
 */
function TrendSparkline({ points }: { points: number[] }) {
  const W = 600;
  const H = 96;
  const PAD = 6;
  const min = 0;
  const max = 100;
  const n = points.length;
  const step = n > 1 ? (W - PAD * 2) / (n - 1) : 0;
  const yFor = (v: number) => PAD + (1 - (v - min) / (max - min)) * (H - PAD * 2);

  const linePath = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${PAD + i * step} ${yFor(v)}`)
    .join(' ');
  const areaPath = `${linePath} L ${PAD + (n - 1) * step} ${H - PAD} L ${PAD} ${H - PAD} Z`;
  const last = points[points.length - 1];
  const first = points[0];
  const delta = last - first;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs text-muted-foreground">
          {first}% <ArrowRight className="w-3 h-3 inline mx-0.5" /> <span className="font-semibold text-foreground">{last}%</span>
        </p>
        <p className={`text-xs font-medium ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-muted-foreground'}`}>
          {delta > 0 ? '+' : ''}{delta} pts
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24" preserveAspectRatio="none">
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(243 75% 59%)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(243 75% 59%)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* 50% and 80% guide lines */}
        <line x1={PAD} x2={W - PAD} y1={yFor(50)} y2={yFor(50)} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 3" />
        <line x1={PAD} x2={W - PAD} y1={yFor(80)} y2={yFor(80)} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 3" />
        {n > 1 && (
          <>
            <path d={areaPath} fill="url(#spark-fill)" />
            <path d={linePath} fill="none" stroke="hsl(243 75% 59%)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        {points.map((v, i) => (
          <circle
            key={i}
            cx={PAD + i * step}
            cy={yFor(v)}
            r={i === n - 1 ? 4 : 2.5}
            fill="hsl(243 75% 59%)"
            stroke="white"
            strokeWidth={i === n - 1 ? 2 : 1}
          />
        ))}
      </svg>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <ReportSkeleton />
        </div>
      }
    >
      <ReportsPageInner />
    </Suspense>
  );
}

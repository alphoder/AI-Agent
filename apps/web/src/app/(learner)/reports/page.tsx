'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { HelpHint } from '@/components/ui/help-hint';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { RichEmptyState } from '@/components/ui/rich-empty-state';
import { ProgressRing } from '@/components/ui/progress-ring';
import {
  ArrowLeft,
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
            icon={BarChart3}
            accent="analytics"
            title="No reports yet"
            description="Complete a training session to get your first detailed report."
            action={{ label: 'Go to dashboard', href: '/dashboard' }}
          />
        </div>
      </div>
    );
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

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import {
  ArrowLeft,
  Clock,
  MessageSquare,
  Calendar,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
  Star,
  Target,
  User,
  Bot,
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
  if (score <= 40) return 'text-rose-500';
  if (score <= 70) return 'text-amber-500';
  if (score <= 85) return 'text-emerald-500';
  return 'text-blue-500';
}

function getScoreRingColor(score: number): string {
  if (score <= 40) return 'stroke-rose-500';
  if (score <= 70) return 'stroke-amber-500';
  if (score <= 85) return 'stroke-emerald-500';
  return 'stroke-blue-500';
}

function getScoreGradient(score: number): string {
  if (score <= 40) return 'from-rose-500 to-pink-500';
  if (score <= 70) return 'from-amber-500 to-orange-500';
  if (score <= 85) return 'from-emerald-500 to-teal-500';
  return 'from-blue-500 to-indigo-500';
}

function getScoreBarBg(score: number): string {
  if (score <= 40) return 'bg-rose-500';
  if (score <= 70) return 'bg-amber-500';
  if (score <= 85) return 'bg-emerald-500';
  return 'bg-blue-500';
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-pulse">
      {/* Back link */}
      <div className="h-4 w-32 rounded bg-muted" />

      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-2/3 rounded bg-muted" />
        <div className="flex gap-4">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-4 w-20 rounded bg-muted" />
          <div className="h-4 w-28 rounded bg-muted" />
        </div>
      </div>

      {/* Score circle */}
      <div className="flex justify-center">
        <div className="w-40 h-40 rounded-full bg-muted" />
      </div>

      {/* Criteria */}
      <div className="rounded-2xl border border-border/50 p-6 space-y-4">
        <div className="h-5 w-40 rounded bg-muted" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-12 rounded bg-muted" />
            </div>
            <div className="h-2 rounded-full bg-muted" />
          </div>
        ))}
      </div>

      {/* Strengths / Improvements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-border/50 p-6 space-y-3">
            <div className="h-5 w-32 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-4 w-5/6 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Feedback */}
      <div className="rounded-2xl border border-border/50 p-6 space-y-3">
        <div className="h-5 w-24 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Circular Score                                                     */
/* ------------------------------------------------------------------ */

function ScoreCircle({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 56;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-44 h-44">
      <svg className="w-44 h-44 -rotate-90" viewBox="0 0 128 128">
        {/* Background ring */}
        <circle
          cx="64" cy="64" r="56"
          fill="none"
          strokeWidth="7"
          className="stroke-muted"
        />
        {/* Score ring */}
        <circle
          cx="64" cy="64" r="56"
          fill="none"
          strokeWidth="7"
          className={getScoreRingColor(score)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold tracking-tight ${getScoreColor(score)}`}>
          {Math.round(score)}
        </span>
        <span className="text-xs text-muted-foreground font-medium mt-0.5">out of 100</span>
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
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{cs.criterion_name}</span>
          <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{cs.weight}% weight</span>
        </div>
        <span className="text-sm font-semibold tabular-nums">{cs.score}<span className="text-muted-foreground font-normal">/5</span></span>
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
        isLearner ? 'bg-blue-100 text-blue-600' : 'bg-violet-100 text-violet-600'
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

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session');
  const assignmentId = searchParams.get('assignment');

  const [report, setReport] = useState<Report | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [reportDate, setReportDate] = useState<string>('\u2014');

  const targetId = sessionId || assignmentId;

  useEffect(() => {
    setReportDate(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  }, []);

  useEffect(() => {
    if (!targetId) return;
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
    return <ReportSkeleton />;
  }

  /* No report */
  if (!report) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-12"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
            <Target className="w-8 h-8 text-muted-foreground/50" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Report not available yet</h2>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Your session report is being generated. Please check back in a moment.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back link */}
      <button
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{report.scenario_title}</h1>
        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            {formatDuration(report.duration_sec || 0)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" />
            {report.total_turns || 0} turns
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {reportDate}
          </span>
        </div>
      </div>

      {/* Overall Score */}
      <div className="rounded-2xl border border-border/50 bg-card p-8">
        <div className="flex flex-col items-center gap-4">
          <ScoreCircle score={report.overall_score} />
          <div className="text-center">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-gradient-to-r ${getScoreGradient(report.overall_score)} text-white`}>
              <Star className="w-3.5 h-3.5" />
              {getScoreLabel(report.overall_score)}
            </span>
          </div>
        </div>
      </div>

      {/* Score Breakdown */}
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <h2 className="text-lg font-semibold mb-5">Score Breakdown</h2>
        <div className="space-y-5">
          {report.criteria_scores.map((cs, i) => (
            <CriteriaBar key={i} cs={cs} />
          ))}
        </div>
      </div>

      {/* Strengths & Improvements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Strengths */}
        <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/30 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <h2 className="font-semibold text-emerald-800">Strengths</h2>
          </div>
          <ul className="space-y-2.5">
            {report.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                  +
                </span>
                <span className="text-emerald-900">{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Improvements */}
        <div className="rounded-2xl border border-amber-200/60 bg-amber-50/30 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-amber-600" />
            </div>
            <h2 className="font-semibold text-amber-800">Areas for Improvement</h2>
          </div>
          <ul className="space-y-2.5">
            {report.improvements.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                  !
                </span>
                <span className="text-amber-900">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Narrative Feedback */}
      {report.narrative_feedback && (
        <div className="rounded-2xl border border-border/50 bg-card p-6">
          <h2 className="text-lg font-semibold mb-3">Coach Feedback</h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{report.narrative_feedback}</p>
        </div>
      )}

      {/* Transcript */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="w-full flex items-center justify-between p-6 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Full Transcript</h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{transcripts.length} messages</span>
          </div>
          {showTranscript ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </button>

        {showTranscript && (
          <div className="px-6 pb-6">
            <div className="max-h-[500px] overflow-y-auto space-y-4 pr-2 scrollbar-thin">
              {transcripts.map((t, i) => (
                <TranscriptBubble key={i} t={t} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2 pb-8">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <button
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium hover:bg-muted/80 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download PDF
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

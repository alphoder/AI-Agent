'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, ArrowLeft, Trophy, PersonStanding, Download } from 'lucide-react';
import apiClient from '@/lib/api-client';
import type { ReportData } from '@/components/report-pdf';

interface CriteriaScore { criterion_name: string; score: number; weight: number; justification: string }
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

function scoreColor(s: number) {
  if (s >= 85) return 'text-indigo-600';
  if (s >= 70) return 'text-emerald-600';
  if (s >= 40) return 'text-amber-600';
  return 'text-rose-600';
}

function ReportView({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [meta, setMeta] = useState<{ scenario_title: string; language: string; ended_at: string | null } | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    apiClient.get(`/sessions/${sessionId}`).then(({ data }) => setMeta(data.data)).catch(() => {});
  }, [sessionId]);

  async function downloadPdf() {
    if (!report) return;
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

  useEffect(() => {
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
  }, [sessionId]);

  if (waiting) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm">Scoring your conversation and body language…</p>
      </div>
    );
  }
  if (error || !report) return <p className="text-sm text-rose-600">{error || 'Report not found.'}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All sessions
        </Link>
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="inline-flex items-center gap-2 rounded-full bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>

      {/* Scores */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border/50 bg-card p-6 flex items-center gap-5">
          <Trophy className="h-8 w-8 text-indigo-600" />
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Overall</p>
            <p className={`text-4xl font-bold ${scoreColor(report.overall_score)}`}>{Math.round(report.overall_score)}<span className="text-lg text-muted-foreground">/100</span></p>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-6 flex items-center gap-5">
          <PersonStanding className="h-8 w-8 text-violet-600" />
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Body language</p>
            {report.body_language_score != null ? (
              <p className={`text-4xl font-bold ${scoreColor(report.body_language_score)}`}>{Math.round(report.body_language_score)}<span className="text-lg text-muted-foreground">/100</span></p>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">Camera was off — no body-language read.</p>
            )}
          </div>
        </div>
      </div>

      {report.body_language_feedback && (
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold mb-1">Body language</h3>
          <p className="text-sm text-muted-foreground">{report.body_language_feedback}</p>
        </div>
      )}

      {/* Strengths & improvements */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold text-emerald-700 mb-2">Strengths</h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
            {report.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold text-amber-700 mb-2">To improve</h3>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-4">
            {report.improvements.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      </div>

      {/* Rubric */}
      <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Rubric breakdown</h3>
        {report.criteria_scores.map((c, i) => (
          <div key={i}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{c.criterion_name}</span>
              <span className="text-muted-foreground">{c.score}/5 · weight {c.weight}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
              <div className="h-full bg-indigo-600" style={{ width: `${(c.score / 5) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">{c.justification}</p>
          </div>
        ))}
      </div>

      {report.narrative_feedback && (
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <h3 className="text-sm font-semibold mb-2">Coach&apos;s notes</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{report.narrative_feedback}</p>
        </div>
      )}
    </div>
  );
}

function HistoryView() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/sessions').then(({ data }) => setRows(data.data)).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your sessions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Review past practice runs and feedback.</p>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl border border-border/50 bg-card animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-12 text-center">
          <p className="font-semibold">No sessions yet</p>
          <p className="text-sm text-muted-foreground mt-1">Practice a scenario to see your feedback here.</p>
          <Link href="/scenarios" className="inline-block mt-4 rounded-full bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">Browse scenarios</Link>
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

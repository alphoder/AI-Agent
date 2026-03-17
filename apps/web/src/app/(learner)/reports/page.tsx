'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface Report {
  overall_score: number;
  criteria_scores: Array<{ criterion_name: string; score: number; weight: number; justification: string }>;
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

function getScoreColor(score: number): string {
  if (score <= 40) return 'text-red-500';
  if (score <= 70) return 'text-yellow-500';
  if (score <= 85) return 'text-green-500';
  return 'text-blue-500';
}

function getScoreBgColor(score: number): string {
  if (score <= 40) return 'stroke-red-500';
  if (score <= 70) return 'stroke-yellow-500';
  if (score <= 85) return 'stroke-green-500';
  return 'stroke-blue-500';
}

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session');
  const assignmentId = searchParams.get('assignment');

  const [report, setReport] = useState<Report | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);

  const targetId = sessionId || assignmentId;

  useEffect(() => {
    if (!targetId) return;
    async function fetch() {
      try {
        const [reportRes, transcriptRes] = await Promise.all([
          apiClient.get(`/sessions/${targetId}/report`),
          apiClient.get(`/sessions/${targetId}/transcript`),
        ]);
        setReport(reportRes.data.data);
        setTranscripts(transcriptRes.data.data);
      } catch (err) {
        console.error('Failed to fetch report:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [targetId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Report not available yet</p>
        <button onClick={() => router.push('/dashboard')} className="mt-4 text-primary hover:underline">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">{report.scenario_title}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Duration: {Math.floor((report.duration_sec || 0) / 60)}m {(report.duration_sec || 0) % 60}s · {report.total_turns || 0} turns
      </p>

      {/* Overall score circle */}
      <div className="flex justify-center mb-8">
        <div className="relative w-32 h-32">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8" className="stroke-muted" />
            <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8"
              className={getScoreBgColor(report.overall_score)}
              strokeDasharray={`${(report.overall_score / 100) * 327} 327`}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-3xl font-bold ${getScoreColor(report.overall_score)}`}>
              {Math.round(report.overall_score)}
            </span>
          </div>
        </div>
      </div>

      {/* Criteria scores */}
      <div className="space-y-3 mb-8">
        <h2 className="font-semibold">Score Breakdown</h2>
        {report.criteria_scores.map((cs, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{cs.criterion_name} ({cs.weight}%)</span>
              <span>{cs.score}/5</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(cs.score / 5) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{cs.justification}</p>
          </div>
        ))}
      </div>

      {/* Strengths & Improvements */}
      <div className="grid grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="font-semibold mb-2 text-green-600">Strengths</h2>
          <ul className="space-y-1 text-sm">
            {report.strengths.map((s, i) => (
              <li key={i} className="flex gap-2"><span className="text-green-500">+</span>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-semibold mb-2 text-orange-600">Areas for Improvement</h2>
          <ul className="space-y-1 text-sm">
            {report.improvements.map((s, i) => (
              <li key={i} className="flex gap-2"><span className="text-orange-500">-</span>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Narrative feedback */}
      {report.narrative_feedback && (
        <div className="mb-8 p-4 bg-muted/50 rounded-lg">
          <h2 className="font-semibold mb-2">Feedback</h2>
          <p className="text-sm">{report.narrative_feedback}</p>
        </div>
      )}

      {/* Transcript toggle */}
      <div className="mb-8">
        <button onClick={() => setShowTranscript(!showTranscript)}
          className="text-sm text-primary hover:underline">
          {showTranscript ? 'Hide' : 'Show'} Full Transcript
        </button>

        {showTranscript && (
          <div className="mt-3 space-y-2 border rounded-lg p-4 max-h-96 overflow-y-auto">
            {transcripts.map((t, i) => (
              <div key={i} className={`text-sm p-2 rounded ${
                i % 2 === 0 ? 'bg-muted/30' : ''
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${t.role === 'learner' ? 'text-blue-500' : 'text-green-500'}`}>
                    {t.role === 'learner' ? 'You' : 'Avatar'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <p>{t.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={() => router.push('/dashboard')}
          className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
          Back to Dashboard
        </button>
        <button className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Download PDF
        </button>
        <button onClick={() => router.back()}
          className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
          Try Again
        </button>
      </div>
    </div>
  );
}

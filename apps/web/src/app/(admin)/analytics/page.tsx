'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface OverviewData {
  totals: {
    total_sessions: number;
    completed_sessions: number;
    total_learners: number;
    active_scenarios: number;
  };
  trends: Array<{ date: string; count: number }>;
  completion_rate: number;
  score_distribution: Array<{ range: string; count: number }>;
  recent_sessions?: RecentSession[];
}

interface RecentSession {
  id: string;
  learner_name: string;
  scenario_title: string;
  overall_score: number | null;
  status: string;
  duration_sec: number | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  active: 'bg-blue-100 text-blue-800',
  created: 'bg-gray-100 text-gray-800',
  timed_out: 'bg-orange-100 text-orange-800',
  error: 'bg-red-100 text-red-800',
};

function formatDuration(sec: number | null): string {
  if (!sec) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data } = await apiClient.get('/analytics/overview');
        setOverview(data.data);
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Failed to load analytics data.
      </div>
    );
  }

  const { totals, trends, completion_rate, score_distribution, recent_sessions } = overview;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <OverviewCard label="Total Sessions" value={totals.total_sessions} />
        <OverviewCard
          label="Completed"
          value={totals.completed_sessions}
          subtitle={`${completion_rate.toFixed(1)}% completion rate`}
        />
        <OverviewCard label="Active Learners" value={totals.total_learners} />
        <OverviewCard label="Active Scenarios" value={totals.active_scenarios} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sessions Per Day Line Chart */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Sessions Per Day (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }
                fontSize={12}
              />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip
                labelFormatter={(d) => new Date(d as string).toLocaleDateString()}
                formatter={(value: number) => [value, 'Sessions']}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Score Distribution Bar Chart */}
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Score Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={score_distribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip formatter={(value: number) => [value, 'Sessions']} />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Sessions Table */}
      {recent_sessions && recent_sessions.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Recent Sessions</h2>
          </div>
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left text-sm font-medium p-3">Learner</th>
                <th className="text-left text-sm font-medium p-3">Scenario</th>
                <th className="text-center text-sm font-medium p-3">Score</th>
                <th className="text-center text-sm font-medium p-3">Duration</th>
                <th className="text-center text-sm font-medium p-3">Status</th>
                <th className="text-right text-sm font-medium p-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {recent_sessions.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/30">
                  <td className="p-3 text-sm">{s.learner_name}</td>
                  <td className="p-3 text-sm">{s.scenario_title}</td>
                  <td className="p-3 text-center text-sm">
                    {s.overall_score != null ? (
                      <span
                        className={`font-medium ${
                          s.overall_score >= 80
                            ? 'text-green-600'
                            : s.overall_score >= 60
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        {Math.round(s.overall_score)}%
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="p-3 text-center text-sm text-muted-foreground">
                    {formatDuration(s.duration_sec)}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        STATUS_COLORS[s.status] || ''
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="p-3 text-right text-sm text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OverviewCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number;
  subtitle?: string;
}) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

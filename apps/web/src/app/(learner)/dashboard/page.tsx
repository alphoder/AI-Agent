'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface Assignment {
  id: string;
  scenario_id: string;
  scenario_title: string;
  scenario_description: string | null;
  persona_name: string;
  avatar_thumbnail_url: string | null;
  difficulty_level: string;
  due_date: string | null;
  status: string;
  overall_score: number | null;
  max_duration_sec: number;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-blue-100 text-blue-800',
  intermediate: 'bg-yellow-100 text-yellow-800',
  advanced: 'bg-red-100 text-red-800',
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  assigned: { label: 'Not Started', color: 'text-gray-600' },
  in_progress: { label: 'In Progress', color: 'text-yellow-600' },
  completed: { label: 'Completed', color: 'text-green-600' },
};

export default function LearnerDashboardPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await apiClient.get('/scenarios/assignments/me');
        setAssignments(data.data);
      } catch (err) {
        console.error('Failed to fetch assignments:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">My Training Sessions</h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No assignments yet</p>
          <p className="text-sm mt-1">Your admin will assign training scenarios to you</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignments.map((a) => (
            <div key={a.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              {/* Card header with avatar */}
              <div className="bg-muted/30 p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                  {a.avatar_thumbnail_url ? (
                    <img src={a.avatar_thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-medium text-muted-foreground">{a.persona_name.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-sm truncate">{a.scenario_title}</h3>
                  <p className="text-xs text-muted-foreground">{a.persona_name}</p>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${DIFFICULTY_COLORS[a.difficulty_level]}`}>
                    {a.difficulty_level}
                  </span>
                  <span className={`text-sm font-medium ${STATUS_CONFIG[a.status]?.color}`}>
                    {a.status === 'completed' && a.overall_score != null
                      ? `Score: ${Math.round(a.overall_score)}%`
                      : STATUS_CONFIG[a.status]?.label}
                  </span>
                </div>

                {a.due_date && (
                  <p className={`text-xs ${isOverdue(a.due_date) && a.status !== 'completed' ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    Due: {new Date(a.due_date).toLocaleDateString()}
                    {isOverdue(a.due_date) && a.status !== 'completed' && ' (Overdue)'}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  Duration: {Math.floor(a.max_duration_sec / 60)} min
                </p>

                <div className="flex gap-2 pt-2">
                  {a.status !== 'completed' ? (
                    <button
                      onClick={() => router.push(`/session/${a.scenario_id}?assignment=${a.id}`)}
                      className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                      {a.status === 'in_progress' ? 'Resume' : 'Start Session'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => router.push(`/session/${a.scenario_id}?assignment=${a.id}`)}
                        className="flex-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                        Try Again
                      </button>
                      <button
                        onClick={() => router.push(`/reports?assignment=${a.id}`)}
                        className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                        View Report
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

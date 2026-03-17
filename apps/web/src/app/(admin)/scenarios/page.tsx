'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface Scenario {
  id: string;
  title: string;
  persona_name: string;
  avatar_thumbnail_url: string | null;
  status: string;
  difficulty_level: string;
  assignment_count: number;
  completed_count: number;
  avg_score: number | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  active: 'bg-green-100 text-green-800',
  archived: 'bg-orange-100 text-orange-800',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: 'bg-blue-100 text-blue-800',
  intermediate: 'bg-yellow-100 text-yellow-800',
  advanced: 'bg-red-100 text-red-800',
};

export default function ScenariosPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    async function fetch() {
      try {
        const params: Record<string, string> = {};
        if (statusFilter !== 'all') params.status = statusFilter;
        const { data } = await apiClient.get('/scenarios', { params });
        setScenarios(data.data);
      } catch (err) {
        console.error('Failed to fetch scenarios:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [statusFilter]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Scenarios</h1>
        <button onClick={() => router.push('/scenarios/create')}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Create Scenario
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {['all', 'draft', 'active', 'archived'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded text-sm capitalize ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left text-sm font-medium p-3">Scenario</th>
                <th className="text-left text-sm font-medium p-3">Status</th>
                <th className="text-left text-sm font-medium p-3">Difficulty</th>
                <th className="text-center text-sm font-medium p-3">Assigned</th>
                <th className="text-center text-sm font-medium p-3">Completed</th>
                <th className="text-center text-sm font-medium p-3">Avg Score</th>
                <th className="text-right text-sm font-medium p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.id} onClick={() => router.push(`/scenarios/${s.id}`)}
                  className="border-t cursor-pointer hover:bg-muted/30">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                        {s.avatar_thumbnail_url ? (
                          <img src={s.avatar_thumbnail_url} alt="" className="w-full h-full object-cover" />
                        ) : <span className="text-xs">{s.persona_name?.charAt(0)}</span>}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{s.persona_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${DIFFICULTY_COLORS[s.difficulty_level]}`}>{s.difficulty_level}</span>
                  </td>
                  <td className="p-3 text-center text-sm">{s.assignment_count}</td>
                  <td className="p-3 text-center text-sm">{s.completed_count}</td>
                  <td className="p-3 text-center text-sm">{s.avg_score != null ? `${Math.round(s.avg_score)}%` : '-'}</td>
                  <td className="p-3 text-right text-sm text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {scenarios.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No scenarios found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

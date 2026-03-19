'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SessionCardProps {
  assignment: {
    id: string;
    scenario: {
      id: string;
      title: string;
      description?: string;
      difficulty_level: string;
      persona?: {
        name: string;
        domain?: string;
        avatar?: { thumbnail_url?: string };
      };
    };
    status: 'assigned' | 'in_progress' | 'completed';
    due_date?: string;
    last_score?: number;
  };
}

export default function SessionCard({ assignment }: SessionCardProps) {
  const { scenario, status, due_date, last_score } = assignment;
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  const isOverdue = isClient && due_date && new Date(due_date) < new Date() && status !== 'completed';

  const difficultyColor: Record<string, string> = {
    beginner: 'bg-green-100 text-green-700',
    intermediate: 'bg-yellow-100 text-yellow-700',
    advanced: 'bg-red-100 text-red-700',
  };

  const statusLabel: Record<string, string> = {
    assigned: 'Not Started',
    in_progress: 'In Progress',
    completed: 'Completed',
  };

  const actionLabel = status === 'completed' ? 'Try Again' : status === 'in_progress' ? 'Resume' : 'Start Session';

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {scenario.persona?.avatar?.thumbnail_url ? (
            <img
              src={scenario.persona.avatar.thumbnail_url}
              alt={scenario.persona.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg">
              🎭
            </div>
          )}
          <div>
            <h3 className="font-semibold text-sm">{scenario.title}</h3>
            {scenario.persona && (
              <p className="text-xs text-muted-foreground">
                {scenario.persona.name}{scenario.persona.domain ? ` — ${scenario.persona.domain}` : ''}
              </p>
            )}
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${difficultyColor[scenario.difficulty_level] || ''}`}>
          {scenario.difficulty_level}
        </span>
      </div>

      {scenario.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{scenario.description}</p>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{statusLabel[status]}</span>
        {due_date && (
          <span className={isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
            Due: {isClient ? new Date(due_date).toLocaleDateString() : '\u2014'}
          </span>
        )}
      </div>

      {status === 'completed' && last_score != null && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                last_score >= 86 ? 'bg-blue-500' :
                last_score >= 71 ? 'bg-green-500' :
                last_score >= 41 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${last_score}%` }}
            />
          </div>
          <span className="text-xs font-medium">{last_score}%</span>
        </div>
      )}

      <div className="flex gap-2 mt-auto">
        <Link
          href={`/session/${assignment.id}?assignment=${assignment.id}`}
          className="flex-1 text-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {actionLabel}
        </Link>
        {status === 'completed' && (
          <Link
            href={`/reports?session=${assignment.id}`}
            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            View Report
          </Link>
        )}
      </div>
    </div>
  );
}

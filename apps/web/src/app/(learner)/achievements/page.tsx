'use client';

import { useState, useEffect, useMemo } from 'react';
import { Trophy, Award, Flame, Zap, Shield, Globe, Clock, CheckCircle2, Lock } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Accent } from '@/components/ui/accent';

interface SessionRow {
  status: string;
  overall_score: number | null;
  body_language_score: number | null;
  duration_sec: number | null;
  ended_at: string | null;
  language: string;
}

interface Badge {
  id: string;
  title: string;
  description: string;
  icon: any;
  metricLabel: string;
  currentValue: number;
  targetValue: number;
  unlocked: boolean;
  unlockDate: string | null;
}

function dateKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

export default function AchievementsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get('/sessions')
      .then(({ data }) => setSessions(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const completed = sessions.filter((s) => s.status === 'completed');
    const totalCount = completed.length;
    
    const scores = completed.filter((s) => s.overall_score != null).map((s) => s.overall_score as number);
    const bestScore = scores.length ? Math.max(...scores) : 0;
    
    const totalSec = completed.reduce((acc, s) => acc + (s.duration_sec || 0), 0);
    const totalMin = Math.round(totalSec / 60);

    const languages = new Set(completed.map((s) => s.language));
    const nonEnglishCount = completed.filter((s) => s.language && s.language !== 'en').length;
    
    const bodyLangSessions = completed.filter((s) => s.body_language_score != null).length;

    // Calculate streak (same logic as home/page.tsx)
    const days = new Set<string>();
    for (const s of completed) if (s.ended_at) days.add(dateKey(new Date(s.ended_at)));
    
    let streak = 0;
    const cur = new Date();
    if (!days.has(dateKey(cur))) cur.setDate(cur.getDate() - 1); 
    while (days.has(dateKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

    // Find unlock dates (earliest session satisfying the condition)
    const firstSessionDate = completed.length ? new Date(completed[completed.length - 1].ended_at || Date.now()).toLocaleDateString() : null;
    
    const score80Session = completed.find((s) => s.overall_score != null && s.overall_score >= 80);
    const score80Date = score80Session ? new Date(score80Session.ended_at || Date.now()).toLocaleDateString() : null;

    const score90Session = completed.find((s) => s.overall_score != null && s.overall_score >= 90);
    const score90Date = score90Session ? new Date(score90Session.ended_at || Date.now()).toLocaleDateString() : null;

    const fiveSessionsSession = completed.length >= 5 ? completed[completed.length - 5] : null;
    const fiveSessionsDate = fiveSessionsSession ? new Date(fiveSessionsSession.ended_at || Date.now()).toLocaleDateString() : null;

    const bodyLangSession = completed.find((s) => s.body_language_score != null);
    const bodyLangDate = bodyLangSession ? new Date(bodyLangSession.ended_at || Date.now()).toLocaleDateString() : null;

    const polyglotSession = completed.find((s) => s.language && s.language !== 'en');
    const polyglotDate = polyglotSession ? new Date(polyglotSession.ended_at || Date.now()).toLocaleDateString() : null;

    return {
      totalCount,
      bestScore,
      totalMin,
      streak,
      nonEnglishCount,
      bodyLangSessions,
      firstSessionDate,
      score80Date,
      score90Date,
      fiveSessionsDate,
      bodyLangDate,
      polyglotDate,
    };
  }, [sessions]);

  const badges: Badge[] = useMemo(() => {
    return [
      {
        id: 'icebreaker',
        title: 'Icebreaker',
        description: 'Complete your first formal AI coaching session.',
        icon: Award,
        metricLabel: 'Sessions',
        currentValue: stats.totalCount,
        targetValue: 1,
        unlocked: stats.totalCount >= 1,
        unlockDate: stats.firstSessionDate,
      },
      {
        id: 'silver_tongue',
        title: 'Silver Tongue',
        description: 'Achieve an overall score of 80 or above.',
        icon: Trophy,
        metricLabel: 'Best Score',
        currentValue: stats.bestScore,
        targetValue: 80,
        unlocked: stats.bestScore >= 80,
        unlockDate: stats.score80Date,
      },
      {
        id: 'golden_voice',
        title: 'Golden Voice',
        description: 'Achieve an overall score of 90 or above.',
        icon: Zap,
        metricLabel: 'Best Score',
        currentValue: stats.bestScore,
        targetValue: 90,
        unlocked: stats.bestScore >= 90,
        unlockDate: stats.score90Date,
      },
      {
        id: 'consistent',
        title: 'Consistent Practice',
        description: 'Complete 5 practice sessions total.',
        icon: CheckCircle2,
        metricLabel: 'Sessions',
        currentValue: stats.totalCount,
        targetValue: 5,
        unlocked: stats.totalCount >= 5,
        unlockDate: stats.fiveSessionsDate,
      },
      {
        id: 'marathoner',
        title: 'Speech Marathoner',
        description: 'Log 30 minutes of speaking practice time.',
        icon: Clock,
        metricLabel: 'Minutes',
        currentValue: stats.totalMin,
        targetValue: 30,
        unlocked: stats.totalMin >= 30,
        unlockDate: stats.totalMin >= 30 ? new Date().toLocaleDateString() : null, // Approx current date
      },
      {
        id: 'streak_3',
        title: 'On Fire',
        description: 'Maintain a 3-day active speaking streak.',
        icon: Flame,
        metricLabel: 'Streak Days',
        currentValue: stats.streak,
        targetValue: 3,
        unlocked: stats.streak >= 3,
        unlockDate: stats.streak >= 3 ? new Date().toLocaleDateString() : null,
      },
      {
        id: 'screen_presence',
        title: 'Screen Presence',
        description: 'Complete a webcam session with body language analysis.',
        icon: Shield,
        metricLabel: 'Webcam Sessions',
        currentValue: stats.bodyLangSessions,
        targetValue: 1,
        unlocked: stats.bodyLangSessions >= 1,
        unlockDate: stats.bodyLangDate,
      },
      {
        id: 'polyglot',
        title: 'Global Speaker',
        description: 'Practice speaking in a non-English language.',
        icon: Globe,
        metricLabel: 'Multilingual Sessions',
        currentValue: stats.nonEnglishCount,
        targetValue: 1,
        unlocked: stats.nonEnglishCount >= 1,
        unlockDate: stats.polyglotDate,
      },
    ];
  }, [stats]);

  const unlockedCount = badges.filter((b) => b.unlocked).length;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Trophy className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Achievements</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Earn badges, build streaks and unlock milestones as your confidence climbs.
            </p>
          </div>
        </div>
      </div>

      {/* Progress Stats Summary */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">Trophy Room Progress</h2>
            <p className="text-sm text-muted-foreground">
              You have unlocked <Accent>{unlockedCount}</Accent> out of {badges.length} badges. Keep practicing to claim them all!
            </p>
          </div>
          <div className="flex gap-6 shrink-0">
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Streak</p>
              <p className="text-2xl font-bold mt-1 text-primary flex items-center justify-center gap-1">
                <Flame className="h-5 w-5 fill-current" /> {stats.streak} days
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Practice</p>
              <p className="text-2xl font-bold mt-1">{stats.totalMin} mins</p>
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="h-2.5 w-full rounded-full bg-secondary overflow-hidden mt-6">
          <div 
            className="h-full bg-primary transition-all duration-700" 
            style={{ width: `${Math.round((unlockedCount / badges.length) * 100)}%` }}
          />
        </div>
      </Card>

      {/* Badge Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl border border-border/50 bg-card animate-pulse" />
          ))
        ) : (
          badges.map((b) => {
            const Icon = b.icon;
            const progressPercent = Math.min(100, Math.round((b.currentValue / b.targetValue) * 100));
            
            return (
              <div 
                key={b.id} 
                className={`relative overflow-hidden rounded-2xl border bg-card p-5 flex flex-col justify-between h-48 transition-all ${
                  b.unlocked 
                    ? 'border-primary/20 bg-primary/[0.01]' 
                    : 'border-border opacity-70'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      b.unlocked ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    {!b.unlocked && <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />}
                  </div>
                  
                  <h3 className="font-semibold text-sm mt-3 leading-snug">{b.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-normal line-clamp-2">{b.description}</p>
                </div>

                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-medium text-muted-foreground">{b.metricLabel}</span>
                    <span className="font-bold text-foreground">
                      {Math.round(b.currentValue)} / {b.targetValue}
                    </span>
                  </div>
                  {b.unlocked ? (
                    <p className="text-[10px] text-emerald-500 font-semibold">
                      Unlocked {b.unlockDate || 'recently'}
                    </p>
                  ) : (
                    <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
                      <div 
                        className="h-full bg-primary" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

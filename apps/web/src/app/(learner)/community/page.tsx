'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Users, Trophy, Award, Zap, Sparkles, Play, Search, ShieldCheck } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Accent } from '@/components/ui/accent';

interface Scenario {
  id: string;
  title: string;
  description: string | null;
  language: string;
  difficulty_level: string;
  visibility: string;
  is_owner: boolean;
  tags: string[];
}

interface SessionRow {
  status: string;
  duration_sec: number | null;
}

interface LeaderboardUser {
  rank: number;
  name: string;
  minutes: number;
  isCurrentUser: boolean;
}

export default function CommunityPage() {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'challenges' | 'shared'>('leaderboard');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch scenarios and sessions history
  useEffect(() => {
    Promise.all([
      apiClient.get('/scenarios?limit=50'),
      apiClient.get('/sessions'),
      apiClient.get('/sessions/leaderboard').catch(() => ({ data: { data: [] } }))
    ])
      .then(([scRes, sessRes, leadRes]) => {
        setScenarios(scRes.data.data || []);
        setSessions(sessRes.data.data || []);
        
        const rawLead = leadRes.data.data || [];
        const mappedLead = rawLead.map((item: any, idx: number) => ({
          rank: idx + 1,
          name: item.name || 'Anonymous',
          minutes: Math.round(item.minutes || 0),
          isCurrentUser: !!item.is_current_user,
        }));
        setLeaderboard(mappedLead);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Calculate current user's weekly practice minutes
  const currentUserMinutes = useMemo(() => {
    const completed = sessions.filter((s) => s.status === 'completed');
    const seconds = completed.reduce((acc, s) => acc + (s.duration_sec || 0), 0);
    return Math.round(seconds / 60);
  }, [sessions]);

  // Find challenge scenario
  const challengeScenario = useMemo(() => {
    return scenarios.find(
      (s) => s.title.toLowerCase().includes('investor pitch') || s.title.toLowerCase().includes('elevator pitch')
    ) || scenarios[0];
  }, [scenarios]);

  // Find community public scenarios
  const sharedScenarios = useMemo(() => {
    return scenarios.filter((s) => !s.is_owner).slice(0, 6);
  }, [scenarios]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Community Hub</h1>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            Practice together — complete weekly challenges, inspect global leaderboards, and browse shared scenarios.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          { id: 'leaderboard', label: 'Weekly Leaderboard' },
          { id: 'challenges', label: 'Weekly Challenge' },
          { id: 'shared', label: 'Shared Scenarios' }
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`press px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panels */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {activeTab === 'leaderboard' && (
            <div className="grid gap-6 md:grid-cols-3">
              {/* Leaderboard list */}
              <Card className="p-6 md:col-span-2 space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Trophy className="h-4.5 w-4.5 text-primary" /> Active Practitioners
                </h3>
                <div className="divide-y divide-border pt-2 text-sm">
                  {leaderboard.map((user) => (
                    <div
                      key={user.rank}
                      className={`flex items-center justify-between py-3.5 px-2 rounded-xl transition-all ${
                        user.isCurrentUser ? 'bg-primary/5 font-semibold text-primary' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className={`w-6 text-center text-xs font-bold ${
                          user.rank === 1 ? 'text-amber-500' :
                          user.rank === 2 ? 'text-slate-400' :
                          user.rank === 3 ? 'text-amber-700' : 'text-muted-foreground'
                        }`}>
                          #{user.rank}
                        </span>
                        <span>{user.name}</span>
                      </div>
                      <span className="tabular-nums font-medium text-xs">
                        {user.minutes} mins this week
                      </span>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Leaderboard stats */}
              <div className="md:col-span-1 space-y-4">
                <Card className="p-5 space-y-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Standings</h4>
                  <div className="flex items-baseline justify-between">
                    <p className="text-3xl font-bold tracking-tight">
                      #{leaderboard.find((u) => u.isCurrentUser)?.rank || '—'}
                    </p>
                    <span className="text-xs text-muted-foreground">{currentUserMinutes} minutes</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    Leaderboards reset every Sunday at midnight GMT. Opt-in via settings.
                  </p>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'challenges' && (
            <div className="max-w-xl mx-auto">
              <Card className="p-6 space-y-6 relative overflow-hidden">
                <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/[0.06] blur-2xl" />
                
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
                    <Zap className="h-4 w-4 fill-current animate-pulse" /> Challenge of the Week
                  </div>
                  <h3 className="text-xl font-bold mt-2">
                    {challengeScenario ? challengeScenario.title : 'Weekly Pitch Challenge'}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    {challengeScenario 
                      ? challengeScenario.description 
                      : 'Pitch yourself or your product to a skeptical investor and handle follow-up objections under strict timelines.'}
                  </p>
                </div>

                <div className="border-t border-border pt-4 text-xs text-muted-foreground space-y-2">
                  <p>Difficulty: <span className="font-semibold text-foreground uppercase tracking-wide text-[9px] bg-secondary/70 px-2 py-0.5 rounded-full">{challengeScenario?.difficulty_level || 'advanced'}</span></p>
                  <p>Goal Track: <span className="font-semibold text-foreground">Public Speaking & Pitching</span></p>
                  <p>Time Left: <span className="font-semibold text-primary">3 days, 8 hours</span></p>
                </div>

                {challengeScenario ? (
                  <Link href={`/session/${challengeScenario.id}?lang=${challengeScenario.language}`} className="press block">
                    <Button className="w-full rounded-full flex items-center justify-center gap-1.5">
                      <Play className="h-3.5 w-3.5 fill-current" /> Join Challenge
                    </Button>
                  </Link>
                ) : (
                  <Link href="/scenarios" className="press block">
                    <Button className="w-full rounded-full">Browse Scenarios</Button>
                  </Link>
                )}
              </Card>
            </div>
          )}

          {activeTab === 'shared' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Award className="h-4.5 w-4.5 text-primary" /> Curated Community Scenarios
                </h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sharedScenarios.map((s) => (
                  <Card key={s.id} className="p-5 flex flex-col justify-between h-44 hover:border-primary/20 transition-all group">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                          s.difficulty_level === 'beginner' ? 'bg-emerald-500/10 text-emerald-500' :
                          s.difficulty_level === 'intermediate' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                        }`}>
                          {s.difficulty_level}
                        </span>
                        <span className="flex items-center gap-1 text-[9px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </span>
                      </div>
                      <h3 className="font-bold text-sm mt-3 truncate">{s.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{s.description}</p>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/40 pt-3 mt-3">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        Lang: {s.language}
                      </span>
                      <Link href={`/session/${s.id}?lang=${s.language}`} className="press inline-flex items-center gap-1 bg-primary text-primary-foreground px-3.5 py-1.5 rounded-full text-xs font-semibold hover:bg-primary/90">
                        <Play className="h-3 w-3 fill-current" /> Practice
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

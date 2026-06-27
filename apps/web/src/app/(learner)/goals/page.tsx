'use client';

import { useState, useEffect } from 'react';
import { Flag, Target, Award, Calendar, Check, Save, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import apiClient from '@/lib/api-client';
import { GOALS, goalLabel } from '@avatar-platform/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Accent } from '@/components/ui/accent';

interface GoalMetadata {
  weeklyTarget: number;
}

interface SessionRow {
  ended_at: string | null;
  status: string;
}

export default function GoalsPage() {
  const { user, setUser } = useAuth();
  
  const [weeklyTarget, setWeeklyTarget] = useState(3);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [sessionsCompletedThisWeek, setSessionsCompletedThisWeek] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fetch session history to calculate current week progress
  useEffect(() => {
    apiClient
      .get('/sessions')
      .then(({ data }) => {
        const rows: SessionRow[] = data.data || [];
        const completed = rows.filter((r) => r.status === 'completed' && r.ended_at);
        
        // Count sessions in the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const count = completed.filter((s) => new Date(s.ended_at!) >= sevenDaysAgo).length;
        setSessionsCompletedThisWeek(count);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Initialize from user metadata
  useEffect(() => {
    const onboarding = user?.metadata?.onboarding as { goals?: string[] } | null | undefined;
    if (onboarding?.goals) {
      setSelectedGoals(onboarding.goals);
    }
    const goalsMeta = user?.metadata?.goals as { weeklyTarget?: number } | null | undefined;
    if (goalsMeta?.weeklyTarget) {
      setWeeklyTarget(goalsMeta.weeklyTarget);
    }
  }, [user]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      // Update user onboarding goals and target settings
      const onboardingMeta = user?.metadata?.onboarding as Record<string, unknown> | null | undefined;
      const payload = {
        onboarding: {
          ...(onboardingMeta || {}),
          goals: selectedGoals,
        },
        goals: {
          weeklyTarget,
        },
      };
      
      const { data } = await apiClient.patch('/auth/me/metadata', payload);
      if (data.success) {
        setUser(data.data);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (e) {
      console.error('Failed to save goals', e);
    } finally {
      setSaving(false);
    }
  }

  function toggleGoal(id: string) {
    setSelectedGoals((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  }

  const completionPercent = Math.min(100, Math.round((sessionsCompletedThisWeek / weeklyTarget) * 100));

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Flag className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Goals</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Define what speaking success looks like, set weekly schedules, and monitor your commitments.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Weekly Target & Progress Ring */}
        <div className="md:col-span-1 space-y-6">
          <Card className="p-6 flex flex-col items-center text-center space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 self-start">
              <Calendar className="h-4 w-4 text-primary" /> Weekly Commitment
            </h2>
            
            <div className="py-6 flex justify-center">
              {loading ? (
                <div className="h-24 w-24 rounded-full border-4 border-dashed border-primary/20 animate-spin" />
              ) : (
                <ProgressRing
                  value={completionPercent}
                  size={120}
                  stroke={10}
                  color="hsl(var(--primary))"
                  label={
                    <div className="flex flex-col items-center leading-none">
                      <span className="text-2xl font-bold">{sessionsCompletedThisWeek}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-1">
                        / {weeklyTarget} sessions
                      </span>
                    </div>
                  }
                />
              )}
            </div>

            <div className="w-full text-center">
              <h3 className="font-semibold text-base">
                {completionPercent >= 100 ? (
                  <span className="text-emerald-500">Weekly Target Achieved! 🎉</span>
                ) : (
                  <>Progress: <Accent>{completionPercent}%</Accent></>
                )}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Completed in the last 7 calendar days.
              </p>
            </div>

            <div className="w-full pt-4 border-t border-border space-y-3">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block text-left">
                Adjust Target
              </label>
              <div className="flex gap-2">
                {[2, 3, 5, 7].map((num) => (
                  <button
                    key={num}
                    onClick={() => setWeeklyTarget(num)}
                    className={`press flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${
                      weeklyTarget === num
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-card hover:bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    {num}x/wk
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Focus Areas */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Target className="h-4 w-4 text-primary" /> Active Practice Focuses
              </h2>
              <span className="text-xs text-muted-foreground">
                {selectedGoals.length} selected
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Choosing these goals helps Bixy recommend the best scenarios to practice and structures your adaptive training curriculum path. Select all that apply.
            </p>

            <div className="grid sm:grid-cols-2 gap-3.5">
              {GOALS.map((g) => {
                const isActive = selectedGoals.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGoal(g.id)}
                    className={`press flex items-start gap-3.5 p-4 rounded-2xl border text-left transition-all ${
                      isActive
                        ? 'border-primary bg-primary/[0.02]'
                        : 'border-border bg-card hover:border-primary/20 hover:bg-muted/10'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      isActive ? 'bg-primary border-primary text-primary-foreground' : 'border-border'
                    }`}>
                      {isActive && <Check className="h-3 w-3 stroke-[3]" />}
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold leading-none">{g.label}</h3>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{g.blurb}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              {saved && (
                <span className="text-xs text-emerald-500 font-medium flex items-center gap-1">
                  <Check className="h-4 w-4" /> Goals saved successfully
                </span>
              )}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="rounded-full px-6 flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {saving ? 'Saving...' : 'Save Goals'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

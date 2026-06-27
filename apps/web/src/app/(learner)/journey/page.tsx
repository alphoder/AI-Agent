'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Route, Lock, CheckCircle2, Play, ChevronRight, Sparkles } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { Card } from '@/components/ui/card';
import { Accent } from '@/components/ui/accent';

interface Scenario {
  id: string;
  title: string;
  language: string;
  difficulty_level: string;
  description: string;
}

interface SessionRow {
  scenario_id: string;
  status: string;
  overall_score: number | null;
}

interface JourneyStep {
  day: number;
  scenarioTitle: string;
  focus: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

const PATHS: Record<string, JourneyStep[]> = {
  interviews: [
    { day: 1, scenarioTitle: 'Exit Interview', focus: 'Handling transitions with composure', difficulty: 'beginner' },
    { day: 2, scenarioTitle: 'Job Interview: Software Engineer', focus: 'Using the STAR framework for tech questions', difficulty: 'intermediate' },
    { day: 3, scenarioTitle: 'Performance Review: Receiving Feedback', focus: 'Active listening and accepting critiques', difficulty: 'intermediate' },
    { day: 4, scenarioTitle: 'Asking for a Promotion', focus: 'Building value claims and presenting outcomes', difficulty: 'intermediate' },
    { day: 5, scenarioTitle: 'Salary Negotiation', focus: 'Objection handling and closing deals', difficulty: 'advanced' },
  ],
  public_speaking: [
    { day: 1, scenarioTitle: 'Wedding Toast', focus: 'Pacing, presence, and storytelling', difficulty: 'beginner' },
    { day: 2, scenarioTitle: 'Public Speaking: Elevator Pitch', focus: 'Capturing attention in under 2 minutes', difficulty: 'beginner' },
    { day: 3, scenarioTitle: 'Conference Talk Q&A', focus: 'Thinking on your feet and answering audience follow-ups', difficulty: 'intermediate' },
    { day: 4, scenarioTitle: 'Investor Pitch', focus: 'Pitching financial metrics and defending decisions', difficulty: 'advanced' },
    { day: 5, scenarioTitle: 'Press Interview: Tough Questions', focus: 'Staying on message under adversarial pressure', difficulty: 'advanced' },
  ],
  difficult_conversations: [
    { day: 1, scenarioTitle: 'Exit Interview', focus: 'Delivering constructive feedback gracefully', difficulty: 'beginner' },
    { day: 2, scenarioTitle: 'Delegating a Big Task', focus: 'Setting clear expectations and capacity building', difficulty: 'intermediate' },
    { day: 3, scenarioTitle: 'Parent–Teacher Conference', focus: 'De-escalating concern and building trust', difficulty: 'intermediate' },
    { day: 4, scenarioTitle: 'Difficult Conversation: Giving Feedback', focus: 'Delivering behavior-focused performance critiques', difficulty: 'advanced' },
    { day: 5, scenarioTitle: 'Resolving a Conflict with a Coworker', focus: 'De-escalating coworker tensions and creating paths forward', difficulty: 'advanced' },
  ],
  default: [
    { day: 1, scenarioTitle: 'Networking: Breaking the Ice', focus: 'Social small-talk and conversational hooks', difficulty: 'beginner' },
    { day: 2, scenarioTitle: 'First Date Conversation', focus: 'Developing rapport and balancing conversation share', difficulty: 'beginner' },
    { day: 3, scenarioTitle: 'Hotel Front Desk: Handling a Complaint', focus: 'Empathetic listening and solution discovery', difficulty: 'intermediate' },
    { day: 4, scenarioTitle: 'Customer Support: Calming an Upset Customer', focus: 'Handling active complaints and de-escalation', difficulty: 'intermediate' },
    { day: 5, scenarioTitle: 'Customer Discovery Interview', focus: 'Asking open-ended discovery questions', difficulty: 'intermediate' },
  ],
};

export default function JourneyPage() {
  const user = useAuth((s) => s.user);
  const userGoals = useMemo(() => {
    return (user?.metadata?.onboarding as { goals?: string[] } | null)?.goals || [];
  }, [user]);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch scenarios and sessions history to link items
  useEffect(() => {
    Promise.all([
      apiClient.get('/scenarios?limit=60'),
      apiClient.get('/sessions')
    ])
      .then(([scRes, sessRes]) => {
        setScenarios(scRes.data.data || []);
        setSessions(sessRes.data.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Determine which curriculum path to display
  const activePath = useMemo(() => {
    if (userGoals.includes('interviews')) return PATHS.interviews;
    if (userGoals.includes('public_speaking')) return PATHS.public_speaking;
    if (userGoals.includes('difficult_conversations')) return PATHS.difficult_conversations;
    return PATHS.default;
  }, [userGoals]);

  // Map journey steps to actual scenarios and session records
  const journeySteps = useMemo(() => {
    let lastCompleted = true; // First step is unlocked by default
    
    return activePath.map((step, idx) => {
      // Find matching seeded scenario
      const scenario = scenarios.find(
        (s) => s.title.toLowerCase().trim() === step.scenarioTitle.toLowerCase().trim()
      );
      
      // Check if user has a completed session for this scenario
      const relevantSessions = scenario 
        ? sessions.filter((s) => s.scenario_id === scenario.id && s.status === 'completed')
        : [];
      
      const completed = relevantSessions.length > 0;
      const bestScore = completed 
        ? Math.max(...relevantSessions.map((s) => s.overall_score || 0))
        : null;

      // A step is unlocked if the previous one was completed
      const unlocked = lastCompleted;
      
      // Update for the next iteration
      lastCompleted = completed;

      return {
        ...step,
        scenarioId: scenario?.id,
        language: scenario?.language || 'en',
        completed,
        bestScore,
        unlocked,
      };
    });
  }, [activePath, scenarios, sessions]);

  // Current day count
  const currentStepIndex = journeySteps.findIndex((s) => !s.completed);
  const currentDay = currentStepIndex !== -1 ? currentStepIndex + 1 : journeySteps.length;

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Route className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Adaptive Journey</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Your personalized day-by-day curriculum path, tailored to your growth goals.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4 max-w-2xl mx-auto">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-3xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-8 relative">
          {/* Header Summary */}
          <Card className="p-5 flex items-center justify-between border-primary/10 bg-primary/[0.01]">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Active Path Progress</h2>
              <p className="text-xs text-muted-foreground">
                Day {currentDay} of {journeySteps.length} · {journeySteps.filter((s) => s.completed).length} completed
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
          </Card>

          {/* Timeline Node Chain */}
          <div className="relative pl-8 border-l border-border/80 ml-4 space-y-8">
            {journeySteps.map((step, idx) => {
              const isActive = !step.completed && step.unlocked;
              
              return (
                <div key={step.day} className="relative">
                  {/* Timeline indicator bubble */}
                  <span className={`absolute -left-[45px] top-1.5 flex h-7.5 w-7.5 items-center justify-center rounded-full border-2 transition-all ${
                    step.completed 
                      ? 'bg-primary border-primary text-primary-foreground' 
                      : isActive 
                        ? 'bg-card border-primary text-primary animate-pulse' 
                        : 'bg-card border-border text-muted-foreground'
                  }`}>
                    {step.completed ? (
                      <CheckCircle2 className="h-4.5 w-4.5 stroke-[2.5]" />
                    ) : (
                      <span className="text-xs font-bold">{step.day}</span>
                    )}
                  </span>

                  {/* Card content */}
                  <div className={`rounded-2xl border bg-card p-5 transition-all ${
                    isActive 
                      ? 'border-primary shadow-sm ring-1 ring-primary/20' 
                      : 'border-border/60'
                  } ${!step.unlocked ? 'opacity-50' : ''}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Day {step.day}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                            step.difficulty === 'beginner' ? 'bg-emerald-500/10 text-emerald-500' :
                            step.difficulty === 'intermediate' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                          }`}>
                            {step.difficulty}
                          </span>
                        </div>
                        
                        <h3 className="font-bold text-sm mt-1.5">{step.scenarioTitle}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{step.focus}</p>
                      </div>

                      <div className="shrink-0 pt-1">
                        {step.completed ? (
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground">Best Score</span>
                            <p className="text-sm font-bold text-emerald-500">{step.bestScore}/100</p>
                          </div>
                        ) : step.unlocked && step.scenarioId ? (
                          <Link
                            href={`/session/${step.scenarioId}?lang=${step.language || 'en'}`}
                            className="press inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            <Play className="h-4 w-4 fill-current ml-0.5" />
                          </Link>
                        ) : (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

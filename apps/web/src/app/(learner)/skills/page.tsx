'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Target, Award, Star, Compass, AlertCircle, Play, ChevronRight } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Accent } from '@/components/ui/accent';

interface Scenario {
  id: string;
  title: string;
  language: string;
  difficulty_level: string;
  tags: string[];
}

interface CriteriaScore {
  criterion_name: string;
  score: number;
}

interface SessionReport {
  overall_score: number;
  criteria_scores: CriteriaScore[];
  body_language_score: number | null;
}

interface SkillDimension {
  id: string;
  name: string;
  description: string;
  score: number; // out of 5
  level: string;
  tips: string[];
  tags: string[];
}

export default function SkillsPage() {
  const [reports, setReports] = useState<SessionReport[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch session scores and scenarios
  useEffect(() => {
    apiClient
      .get('/sessions')
      .then(async ({ data }) => {
        const completed = (data.data || []).filter((s: any) => s.status === 'completed');
        // Fetch detailed reports for completed sessions
        const reportPromises = completed.map((s: any) =>
          apiClient.get(`/sessions/${s.id}/report`).then((r) => r.data.data).catch(() => null)
        );
        const detailedReports = await Promise.all(reportPromises);
        setReports(detailedReports.filter(Boolean));
      })
      .catch(() => {});

    apiClient
      .get('/scenarios?limit=50')
      .then(({ data }) => setScenarios(data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Compute skill averages from session rubrics
  const skills: SkillDimension[] = useMemo(() => {
    const rawScores = {
      clarity: [] as number[],
      persuasion: [] as number[],
      empathy: [] as number[],
      bodyLang: [] as number[],
    };

    reports.forEach((rep) => {
      // 1. Process rubric criteria scores
      (rep.criteria_scores || []).forEach((c) => {
        const name = c.criterion_name.toLowerCase();
        if (name.includes('clarity') || name.includes('structure') || name.includes('hook') || name.includes('delivery')) {
          rawScores.clarity.push(c.score);
        } else if (name.includes('persuasion') || name.includes('negotiation') || name.includes('sales') || name.includes('objection')) {
          rawScores.persuasion.push(c.score);
        } else if (name.includes('empathy') || name.includes('rapport') || name.includes('listening') || name.includes('ownership')) {
          rawScores.empathy.push(c.score);
        }
      });

      // 2. Process body language score
      if (rep.body_language_score != null) {
        // Map 0..100 to 1..5 scale
        rawScores.bodyLang.push((rep.body_language_score / 100) * 4 + 1);
      }
    });

    const getAverage = (arr: number[]) => {
      if (!arr.length) return 3.0; // default baseline
      return parseFloat((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1));
    };

    const getMasteryLevel = (avg: number) => {
      if (avg >= 4.2) return 'Master (Fluent)';
      if (avg >= 3.2) return 'Practitioner (Capable)';
      return 'Novice (Needs Work)';
    };

    const clarityAvg = getAverage(rawScores.clarity);
    const persuasionAvg = getAverage(rawScores.persuasion);
    const empathyAvg = getAverage(rawScores.empathy);
    const bodyLangAvg = getAverage(rawScores.bodyLang);

    return [
      {
        id: 'clarity',
        name: 'Clarity & Structure',
        description: 'Organizing thoughts, structuring answers (e.g. STAR framework), and delivering concise points.',
        score: clarityAvg,
        level: getMasteryLevel(clarityAvg),
        tips: [
          'Use the STAR model (Situation, Task, Action, Result) for behavioral questions.',
          'Start with a hook or a key summary sentence to frame your response.'
        ],
        tags: ['clarity', 'public-speaking', 'interview'],
      },
      {
        id: 'persuasion',
        name: 'Persuasion & Objection',
        description: 'Handling challenging pushback, demonstrating value, and negotiating outcomes.',
        score: persuasionAvg,
        level: getMasteryLevel(persuasionAvg),
        tips: [
          'Listen completely to objections before countering; validate the concern first.',
          'State facts and market values instead of feelings to justify negotiations.'
        ],
        tags: ['persuasion', 'sales', 'negotiation'],
      },
      {
        id: 'empathy',
        name: 'Empathy & Rapport',
        description: 'Active listening, aligning tone, taking responsibility, and de-escalating tension.',
        score: empathyAvg,
        level: getMasteryLevel(empathyAvg),
        tips: [
          'Mirror emotional terms to build active rapport (e.g., "I hear your concern...").',
          'Avoid blaming external systems; own mistakes clearly and offer fixes.'
        ],
        tags: ['empathy', 'communication', 'conflict'],
      },
      {
        id: 'body_language',
        name: 'Body Language & Presence',
        description: 'Posture alignment, eye contact stability, and expressions measured from webcam frames.',
        score: bodyLangAvg,
        level: getMasteryLevel(bodyLangAvg),
        tips: [
          'Position your camera at eye level and keep your shoulders relaxed.',
          'Ensure your background is well-lit to prevent tracking dropouts.'
        ],
        tags: ['confidence'],
      },
    ];
  }, [reports]);

  // Find recommended scenarios based on active skill tag criteria
  const recommendedDrills = useMemo(() => {
    // Collect all active tags where user score is < 4.0 (needs growth)
    const growthSkills = skills.filter((s) => s.score < 4.0);
    const targetTags = new Set<string>();
    
    if (growthSkills.length) {
      growthSkills.forEach((s) => s.tags.forEach((t) => targetTags.add(t)));
    } else {
      // Default fallback tags
      targetTags.add('interview');
      targetTags.add('public-speaking');
    }

    return scenarios
      .filter((s) => s.tags && s.tags.some((t) => targetTags.has(t)))
      .slice(0, 3);
  }, [skills, scenarios]);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <Target className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Skills Inventory</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Level up discrete speaking categories, tracked and scored across all completed practices.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Skill Blocks */}
          <div className="md:col-span-2 space-y-4">
            {skills.map((skill) => (
              <Card key={skill.id} className="p-5 flex items-start gap-5">
                <div className="shrink-0 pt-1">
                  <ProgressRing
                    value={Math.round((skill.score / 5) * 100)}
                    size={64}
                    stroke={6}
                    color="hsl(var(--primary))"
                    label={
                      <span className="text-xs font-bold text-foreground">
                        {skill.score}
                      </span>
                    }
                  />
                </div>

                <div className="space-y-2 flex-1">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h3 className="font-bold text-sm leading-none">{skill.name}</h3>
                    <span className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {skill.level}
                    </span>
                  </div>
                  
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {skill.description}
                  </p>

                  <div className="pt-2.5 border-t border-border/50 text-[11px] text-muted-foreground space-y-1.5">
                    <p className="font-semibold text-foreground">Pro-Tips for Practice:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {skill.tips.map((tip, idx) => (
                        <li key={idx} className="leading-relaxed">{tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Recommended Drills */}
          <div className="md:col-span-1 space-y-4">
            <Card className="p-5 space-y-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Compass className="h-4 w-4" /> Recommended Drills
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Based on your current skill levels, we recommend practicing these scenarios to build confidence where it counts.
              </p>

              <div className="space-y-3 pt-2">
                {recommendedDrills.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No recommendations available. Try browsing scenarios.</p>
                ) : (
                  recommendedDrills.map((drill) => (
                    <div
                      key={drill.id}
                      className="rounded-xl border border-border p-3 flex items-center justify-between gap-3 hover:border-primary/20 transition-all"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-xs truncate">{drill.title}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">
                          {drill.difficulty_level}
                        </p>
                      </div>
                      <Link href={`/session/${drill.id}?lang=${drill.language}`} className="press shrink-0">
                        <Button className="h-7 w-7 rounded-full p-0 flex items-center justify-center">
                          <Play className="h-3 w-3 fill-current ml-0.5" />
                        </Button>
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

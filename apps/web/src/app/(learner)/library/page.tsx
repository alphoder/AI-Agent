'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, Search, Plus, Sparkles, AlertCircle, Copy, Check, ArrowRight, Play, Settings, Loader2 } from 'lucide-react';
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

const RUBRIC_INFO = [
  {
    name: 'Interview Rubric',
    description: 'Best for standard job interviews, technical screens, or university defend sessions.',
    criteria: [
      { name: 'Clarity & Structure', weight: 35, desc: 'STAR model, coherent answers.' },
      { name: 'Specificity & Evidence', weight: 35, desc: 'Using metrics and concrete examples.' },
      { name: 'Engagement & Curiosity', weight: 30, desc: 'Listening and follow-up queries.' }
    ]
  },
  {
    name: 'Persuasion & Sales Rubric',
    description: 'Perfect for cold calls, investor pitches, or negotiating deals.',
    criteria: [
      { name: 'Opening & Rapport', weight: 30, desc: 'Earning attention fast, setting tone.' },
      { name: 'Argument & Objection Handling', weight: 40, desc: 'Proving value under pushback.' },
      { name: 'Close & Next Step', weight: 30, desc: 'Securing a clear, mutual outcome.' }
    ]
  },
  {
    name: 'Empathy & De-escalation Rubric',
    description: 'Best for conflict resolution, parent reviews, or handling customer complaints.',
    criteria: [
      { name: 'Empathy & Tone', weight: 30, desc: 'Remaining calm, safe, and polite.' },
      { name: 'Ownership & Honesty', weight: 30, desc: 'Taking responsibility, admitting errors.' },
      { name: 'Resolution', weight: 40, desc: 'Agreeing a plan to solve the issue.' }
    ]
  }
];

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<'scenarios' | 'rubrics' | 'prompt_helper'>('scenarios');
  
  // Scenarios states
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const [filterOwner, setFilterOwner] = useState<'all' | 'public' | 'custom'>('all');

  // Prompt refiner states
  const [draftPrompt, setDraftPrompt] = useState('');
  const [improvedPrompt, setImprovedPrompt] = useState('');
  const [refining, setRefining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load scenarios on mount
  useEffect(() => {
    if (activeTab === 'scenarios') {
      setLoading(true);
      apiClient
        .get('/scenarios?limit=60')
        .then(({ data }) => setScenarios(data.data || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [activeTab]);

  async function handleImprovePrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!draftPrompt.trim()) return;
    setRefining(true);
    setError(null);
    setImprovedPrompt('');
    try {
      const { data } = await apiClient.post('/scenarios/improve-prompt', {
        prompt: draftPrompt,
      });
      if (data.success && data.data?.improved) {
        setImprovedPrompt(data.data.improved);
      } else {
        setError('Failed to refine prompt. Please try again.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'AI service offline. Try again later.');
    } finally {
      setRefining(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(improvedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const filteredScenarios = useMemo(() => {
    return scenarios.filter((s) => {
      const matchSearch =
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.description || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchDifficulty = filterDifficulty === 'all' || s.difficulty_level === filterDifficulty;
      const matchOwner =
        filterOwner === 'all' ||
        (filterOwner === 'public' && !s.is_owner) ||
        (filterOwner === 'custom' && s.is_owner);
      return matchSearch && matchDifficulty && matchOwner;
    });
  }, [scenarios, searchQuery, filterDifficulty, filterOwner]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
            <BookOpen className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Library Workspace</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Manage custom scenarios, review grading rubrics, or polish agent system prompts.
            </p>
          </div>
        </div>
        <Link href="/scenarios/create" className="press shrink-0">
          <Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 self-start">
            <Plus className="h-4 w-4" /> Create Scenario
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {([
          { id: 'scenarios', label: 'Practice Scenarios' },
          { id: 'rubrics', label: 'Evaluation Rubrics' },
          { id: 'prompt_helper', label: 'AI Prompt Refiner' }
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

      {/* Content Panels */}
      {activeTab === 'scenarios' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search scenarios..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-secondary/20 pl-9 pr-4 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value as any)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Difficulties</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>

              <select
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value as any)}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold focus:outline-none"
              >
                <option value="all">All Scenarios</option>
                <option value="public">Library templates</option>
                <option value="custom">My Custom Drafts</option>
              </select>
            </div>
          </div>

          {/* Scenario Grid */}
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-2xl border border-border bg-card animate-pulse" />
              ))}
            </div>
          ) : filteredScenarios.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No scenarios found matching your filters.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredScenarios.map((s) => (
                <Card key={s.id} className="p-5 flex flex-col justify-between h-44 hover:border-primary/30 transition-all group">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                        s.difficulty_level === 'beginner' ? 'bg-emerald-500/10 text-emerald-500' :
                        s.difficulty_level === 'intermediate' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                      }`}>
                        {s.difficulty_level}
                      </span>
                      {s.is_owner && (
                        <span className="rounded-full bg-secondary/80 text-muted-foreground px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider border border-border">
                          Custom
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm mt-2.5 truncate">{s.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{s.description || 'No description provided.'}</p>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/40 pt-3 mt-3">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                      Language: {s.language}
                    </span>
                    <div className="flex gap-2">
                      {s.is_owner && (
                        <Link href={`/scenarios/${s.id}/edit`} className="press p-1.5 rounded-full bg-secondary hover:bg-muted text-muted-foreground hover:text-foreground">
                          <Settings className="h-3.5 w-3.5" />
                        </Link>
                      )}
                      <Link href={`/session/${s.id}?lang=${s.language}`} className="press inline-flex items-center gap-1 bg-primary text-primary-foreground px-3.5 py-1.5 rounded-full text-xs font-semibold hover:bg-primary/90">
                        <Play className="h-3 w-3 fill-current" /> Practice
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'rubrics' && (
        <div className="grid gap-6 md:grid-cols-3">
          {RUBRIC_INFO.map((r, i) => (
            <Card key={i} className="p-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-sm">{r.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-normal">{r.description}</p>
                </div>
                
                <div className="space-y-3.5 pt-2 border-t border-border">
                  {r.criteria.map((c, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span>{c.name}</span>
                        <span className="text-primary font-bold">{c.weight}%</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-normal">{c.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'prompt_helper' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Draft Inputs */}
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <Sparkles className="h-4.5 w-4.5 text-primary" /> Draft Your Coach
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Write a rough overview of who the coach should play and how they should react. Gemini will rewrite it into a system prompt.
              </p>
            </div>

            <form onSubmit={handleImprovePrompt} className="space-y-4 pt-2">
              <textarea
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                required
                rows={7}
                placeholder="Example: I want an interviewer who acts like a tough tech manager at Google. Ask me coding questions, keep it hard and probe when I say vague things..."
                className="w-full rounded-xl border border-border bg-secondary/20 p-3.5 text-sm focus:ring-1 focus:ring-primary focus:outline-none resize-none font-sans"
              />

              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={refining || !draftPrompt.trim()}
                className="w-full rounded-full flex items-center justify-center gap-1.5"
              >
                {refining && <Loader2 className="h-4 w-4 animate-spin" />}
                {refining ? 'Refining Prompt...' : 'Refine System Prompt'}
              </Button>
            </form>
          </Card>

          {/* Improved Output */}
          <Card className="p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-sm">Optimized System Prompt</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The refined prompt structures guidelines for the Gemini Live agent.
                </p>
              </div>

              {improvedPrompt ? (
                <div className="rounded-xl border border-border bg-secondary/35 p-4 text-xs font-mono max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed select-all">
                  {improvedPrompt}
                </div>
              ) : (
                <div className="h-52 rounded-xl border-dashed border-2 border-border flex flex-col items-center justify-center text-center p-4 text-muted-foreground text-xs">
                  <p>Submit your draft on the left to see the optimized output here.</p>
                </div>
              )}
            </div>

            {improvedPrompt && (
              <div className="flex gap-3 border-t border-border pt-4 mt-4">
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  className="flex-1 rounded-full flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy Prompt'}
                </Button>
                <Link href="/scenarios/create" className="flex-1">
                  <Button className="w-full rounded-full flex items-center justify-center gap-1.5">
                    Create Scenario <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

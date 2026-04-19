'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { Plus, Drama, Thermometer, Database, Shield } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { RichEmptyState } from '@/components/ui/rich-empty-state';

interface Persona {
  id: string;
  name: string;
  description: string | null;
  avatar_name: string;
  avatar_thumbnail_url: string | null;
  rag_enabled: boolean;
  temperature: number;
  guardrails?: Record<string, unknown> | unknown[] | null;
  created_at: string;
}

function countGuardrails(g: Persona['guardrails']): number {
  if (!g) return 0;
  if (Array.isArray(g)) return g.length;
  if (typeof g === 'object') {
    // count truthy top-level entries (blocked_topics array, pii_redaction flag, etc.)
    let n = 0;
    for (const v of Object.values(g as Record<string, unknown>)) {
      if (Array.isArray(v)) n += v.length;
      else if (v) n += 1;
    }
    return n;
  }
  return 0;
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full shimmer-bg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded shimmer-bg" />
          <div className="h-3 w-1/2 rounded shimmer-bg" />
        </div>
      </div>
      <div className="h-3 w-full rounded shimmer-bg" />
      <div className="h-3 w-5/6 rounded shimmer-bg" />
      <div className="flex gap-2">
        <div className="h-5 w-16 rounded-full shimmer-bg" />
        <div className="h-5 w-14 rounded-full shimmer-bg" />
      </div>
    </div>
  );
}

export default function PersonasPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await apiClient.get('/personas');
        setPersonas(data.data);
      } catch (err) {
        console.error('Failed to fetch personas:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Drama}
        accent="personas"
        title="Personas"
        subtitle="Character profiles with personality, prompt, and voice modulation."
        actions={
          <Link
            href="/personas/create"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create persona
          </Link>
        }
      />

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : personas.length === 0 ? (
        <RichEmptyState
          icon={Drama}
          accent="personas"
          title="No personas yet"
          description="Personas are the AI characters behind your avatars — define how they talk and behave."
          action={{ label: 'Create persona', href: '/personas/create' }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
          {personas.map((persona) => {
            const tempLabel =
              persona.temperature <= 0.3 ? 'Focused' :
              persona.temperature <= 0.7 ? 'Balanced' : 'Creative';
            const tempColor =
              persona.temperature <= 0.3 ? 'text-blue-700 bg-blue-50' :
              persona.temperature <= 0.7 ? 'text-emerald-700 bg-emerald-50' :
              'text-orange-700 bg-orange-50';
            const guardrailCount = countGuardrails(persona.guardrails);

            return (
              <div
                key={persona.id}
                onClick={() => router.push(`/personas/${persona.id}`)}
                className="card-interactive group rounded-2xl border border-border/50 bg-card p-5 cursor-pointer flex flex-col gap-4"
              >
                {/* Header row */}
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-grad-personas flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden">
                    {persona.avatar_thumbnail_url ? (
                      <img
                        src={persona.avatar_thumbnail_url}
                        alt={persona.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-base font-bold text-white">
                        {persona.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {persona.name}
                    </p>
                    {persona.avatar_name && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        via <span className="font-medium text-foreground/70">{persona.avatar_name}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 min-h-[2.25rem]">
                  {persona.description || 'No description provided.'}
                </p>

                {/* Meta pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${tempColor}`}>
                    <Thermometer className="w-3 h-3" />
                    {tempLabel}
                  </span>

                  {persona.rag_enabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700">
                      <Database className="w-3 h-3" />
                      RAG
                    </span>
                  )}

                  {guardrailCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700">
                      <Shield className="w-3 h-3" />
                      {guardrailCount} guardrail{guardrailCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { Plus, Drama, Thermometer, Database, ChevronRight } from 'lucide-react';

interface Persona {
  id: string;
  name: string;
  description: string | null;
  avatar_name: string;
  avatar_thumbnail_url: string | null;
  rag_enabled: boolean;
  temperature: number;
  created_at: string;
}

const GRADIENT_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-cyan-500 to-blue-600',
];

function getGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return GRADIENT_COLORS[Math.abs(h) % GRADIENT_COLORS.length];
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-5 py-4 animate-pulse border-b border-border/50 last:border-0">
      <div className="w-11 h-11 rounded-full bg-muted flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="h-5 w-20 rounded bg-muted" />
        <div className="h-5 w-14 rounded bg-muted" />
      </div>
    </div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-5">
        <Drama className="w-10 h-10 text-muted-foreground/40" />
      </div>
      <h3 className="text-base font-semibold mb-1.5">No personas yet</h3>
      <p className="text-sm text-muted-foreground text-center max-w-xs mb-5">
        A persona combines an avatar with a personality profile for training scenarios.
      </p>
      <button
        onClick={onCreateClick}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Create Persona
      </button>
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
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Personas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI personalities that power your training scenarios.
          </p>
        </div>
        <button
          onClick={() => router.push('/personas/create')}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create Persona
        </button>
      </div>

      {/* Summary stat */}
      {!loading && personas.length > 0 && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{personas.length}</span> persona{personas.length !== 1 ? 's' : ''} configured
        </div>
      )}

      {/* List */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
        ) : personas.length === 0 ? (
          <EmptyState onCreateClick={() => router.push('/personas/create')} />
        ) : (
          <div className="divide-y divide-border/50">
            {personas.map((persona) => {
              const gradient = getGradient(persona.name);
              const tempLabel =
                persona.temperature <= 0.3 ? 'Focused' :
                persona.temperature <= 0.7 ? 'Balanced' : 'Creative';
              const tempColor =
                persona.temperature <= 0.3 ? 'text-blue-600 bg-blue-50' :
                persona.temperature <= 0.7 ? 'text-emerald-600 bg-emerald-50' :
                'text-orange-600 bg-orange-50';

              return (
                <div
                  key={persona.id}
                  onClick={() => router.push(`/personas/${persona.id}`)}
                  className="group flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  {/* Avatar thumbnail */}
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden`}>
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

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {persona.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {persona.description || `Avatar: ${persona.avatar_name}`}
                    </p>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="text-xs text-muted-foreground/60">via</span>
                      <span className="font-medium text-foreground/70 max-w-[80px] truncate">{persona.avatar_name}</span>
                    </span>

                    {persona.rag_enabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700">
                        <Database className="w-3 h-3" />
                        RAG
                      </span>
                    )}

                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${tempColor}`}>
                      <Thermometer className="w-3 h-3" />
                      {tempLabel}
                    </span>

                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors ml-1" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

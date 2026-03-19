'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

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

export default function PersonasPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await apiClient.get('/personas');
        setPersonas(data.data);
      } catch (err) {
        console.error('Failed to fetch personas:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Personas</h1>
        <button
          onClick={() => router.push('/personas/create')}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create Persona
        </button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border rounded-lg p-4">
              <div className="w-12 h-12 rounded-full bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="h-3 w-12 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : personas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No personas found</p>
          <p className="text-sm mt-1">Create your first persona to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {personas.map((persona) => (
            <div
              key={persona.id}
              onClick={() => router.push(`/personas/${persona.id}`)}
              className="flex items-center gap-4 border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                {persona.avatar_thumbnail_url ? (
                  <img src={persona.avatar_thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-medium text-muted-foreground">
                    {persona.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{persona.name}</h3>
                <p className="text-sm text-muted-foreground truncate">
                  {persona.description || 'No description'}
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
                <span>Avatar: {persona.avatar_name}</span>
                {persona.rag_enabled && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-medium">
                    RAG
                  </span>
                )}
                <span>Temp: {persona.temperature}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

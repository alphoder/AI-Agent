'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ScenarioForm, ScenarioFormValue, emptyScenario } from '@/components/scenario-form';
import apiClient from '@/lib/api-client';

export default function EditScenarioPage() {
  const params = useParams();
  const id = params.id as string;
  const [value, setValue] = useState<ScenarioFormValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get(`/scenarios/${id}`)
      .then(({ data }) => {
        const s = data.data;
        if (!s.is_owner) {
          setError('You can only edit scenarios you created. Duplicate it from the library to make your own copy.');
          return;
        }
        setValue({
          ...emptyScenario(),
          id: s.id,
          title: s.title || '',
          description: s.description || '',
          objective: s.objective || '',
          system_prompt: s.system_prompt || '',
          opening_message: s.opening_message || '',
          language: s.language || 'en',
          voice: s.voice || 'Aoede',
          difficulty_level: s.difficulty_level || 'intermediate',
          visibility: s.visibility || 'private',
          tags: s.tags || [],
          scoring_rubric: s.scoring_rubric?.length ? s.scoring_rubric : emptyScenario().scoring_rubric,
        });
      })
      .catch(() => setError('Scenario not found.'));
  }, [id]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!value) return <div className="h-64 rounded-2xl border border-border/50 bg-card animate-pulse" />;
  return <ScenarioForm mode="edit" initial={value} />;
}

'use client';

import { ScenarioForm, emptyScenario } from '@/components/scenario-form';

export default function CreateScenarioPage() {
  return <ScenarioForm mode="create" initial={emptyScenario()} />;
}
